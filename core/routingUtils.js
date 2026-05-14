// ─────────────────────────────────────────────
// core/routingUtils.js — Routing validation, synonym expansion,
//   parameter normalization, and confidence handling
// ─────────────────────────────────────────────

const { getRegistry } = require('./registry');

// Default date parameter aliases for cross-API compatibility
const DEFAULT_DATE_ALIASES = {
  from: ['from', 'start', 'startDate', 'startInterval', 'dateFrom'],
  to: ['to', 'end', 'endDate', 'endInterval', 'dateTo']
};

/**
 * Expand user message with synonyms from registry
 * @param {string} message - User message
 * @param {Object} synonyms - Synonym dictionary from registry
 * @returns {string} Expanded message with additional keywords
 */
function expandSynonyms(message, synonyms = {}) {
  if (!message || !synonyms || Object.keys(synonyms).length === 0) {
    return message;
  }
  
  const lowerMessage = message.toLowerCase();
  const expansions = [];
  
  for (const [canonical, alternatives] of Object.entries(synonyms)) {
    // Check if user message contains any synonym
    const allTerms = [canonical, ...alternatives];
    for (const term of allTerms) {
      if (lowerMessage.includes(term.toLowerCase())) {
        // Add the canonical term and top alternatives as context hints
        expansions.push(`[synonym: ${canonical}]`);
        break;
      }
    }
  }
  
  if (expansions.length > 0) {
    return `${message}\n\nContext hints: ${expansions.join(', ')}`;
  }
  
  return message;
}

/**
 * Normalize query parameters to match API's expected parameter names
 * @param {Object} apiDef - API definition from registry
 * @param {Object} queryParams - Query parameters from LLM
 * @param {Object} dateAliases - Date parameter aliases
 * @returns {Object} Normalized parameters
 */
function normalizeQueryParams(apiDef, queryParams = {}, dateAliases = DEFAULT_DATE_ALIASES) {
  if (!queryParams || !apiDef?.parameters) {
    return queryParams;
  }
  
  const normalized = { ...queryParams };
  const apiParamNames = apiDef.parameters.map(p => p.name);
  
  // Build a reverse lookup: alias -> canonical API param name
  const aliasToApiParam = {};
  for (const param of apiDef.parameters) {
    // Check if this param is a known date alias
    for (const [canonical, aliases] of Object.entries(dateAliases)) {
      if (aliases.includes(param.name)) {
        // Map all aliases to this API's actual param name
        for (const alias of aliases) {
          aliasToApiParam[alias] = param.name;
        }
        break;
      }
    }
  }
  
  // Remap query params using aliases
  const keysToRemove = [];
  for (const [key, value] of Object.entries(normalized)) {
    const mappedKey = aliasToApiParam[key];
    if (mappedKey && mappedKey !== key && !normalized[mappedKey]) {
      normalized[mappedKey] = value;
      keysToRemove.push(key);
    }
  }
  
  // Remove original aliased keys
  for (const key of keysToRemove) {
    delete normalized[key];
  }
  
  // Remove any params not in the API definition (to avoid sending invalid params)
  const cleanedParams = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (apiParamNames.includes(key) && value !== undefined && value !== null && value !== '') {
      cleanedParams[key] = value;
    }
  }
  
  return cleanedParams;
}

/**
 * Validate routing decision against API definition
 * @param {Object} apiPlan - LLM's routing plan
 * @param {Object} apiDef - API definition from registry
 * @param {string} userMessage - Original user message
 * @returns {Object} Validation result { valid, missing, warnings }
 */
function validateRouting(apiPlan, apiDef, userMessage = '') {
  const result = {
    valid: true,
    missing: [],
    warnings: [],
    suggestions: []
  };
  
  if (!apiDef) {
    result.valid = false;
    result.warnings.push(`Unknown API ID: ${apiPlan?.apiId}`);
    return result;
  }
  
  // Check required parameters
  const allParams = { ...(apiPlan.pathParams || {}), ...(apiPlan.queryParams || {}) };
  const requiredParams = (apiDef.parameters || []).filter(p => p.required);
  
  for (const param of requiredParams) {
    const value = allParams[param.name];
    if (value === undefined || value === null || value === '') {
      result.missing.push({
        name: param.name,
        type: param.type,
        description: param.description
      });
    }
  }
  
  if (result.missing.length > 0) {
    result.valid = false;
    result.warnings.push(`Missing required parameters: ${result.missing.map(p => p.name).join(', ')}`);
  }
  
  // Check for parameter type mismatches
  for (const param of apiDef.parameters || []) {
    const value = allParams[param.name];
    if (value === undefined || value === null) continue;
    
    // Check array types
    if (param.type?.includes('array') && !Array.isArray(value)) {
      result.warnings.push(`Parameter "${param.name}" should be an array but got: ${typeof value}`);
      result.suggestions.push(`Convert ${param.name} to array: [${value}]`);
    }
    
    // Check integer types  
    if (param.type === 'integer' && typeof value !== 'number') {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        result.warnings.push(`Parameter "${param.name}" should be an integer but got: ${value}`);
      }
    }
  }
  
  return result;
}

/**
 * Handle low confidence routing decisions
 * @param {Object} apiPlan - LLM's routing plan
 * @param {number} threshold - Confidence threshold
 * @returns {Object} Handling result { proceed, useAlternative, needsClarification, message }
 */
function handleLowConfidence(apiPlan, threshold = 0.7) {
  const confidence = apiPlan.confidence ?? 1.0;
  
  if (confidence >= threshold) {
    return { proceed: true, useAlternative: false, needsClarification: false };
  }
  
  if (confidence >= 0.5 && apiPlan.alternativeApiId) {
    return {
      proceed: true,
      useAlternative: false, // Could set to true to auto-switch
      needsClarification: false,
      message: `Routing confidence is ${(confidence * 100).toFixed(0)}%. Alternative API: ${apiPlan.alternativeApiId}`
    };
  }
  
  if (confidence < 0.5) {
    return {
      proceed: true, // Still proceed but log warning
      useAlternative: false,
      needsClarification: true,
      message: `Low confidence routing (${(confidence * 100).toFixed(0)}%). Results may not match your intent.`
    };
  }
  
  return { proceed: true, useAlternative: false, needsClarification: false };
}

/**
 * Find best matching API based on intent category
 * @param {string} category - Intent category (oee, cycle_time, quality, performance)
 * @param {string} message - User message
 * @param {Object} registry - API registry
 * @returns {Array} Ranked list of matching APIs
 */
function findAPIsByCategory(category, message, registry) {
  const categoryAPIs = registry.intentCategories?.[category] || [];
  const lowerMessage = message.toLowerCase();
  
  const scoredAPIs = [];
  
  for (const apiId of categoryAPIs) {
    const apiDef = registry.apis.find(a => a.id === apiId);
    if (!apiDef) continue;
    
    let score = 0;
    
    // Score based on keyword matches
    for (const keyword of (apiDef.keywords || [])) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        score += keyword.split(' ').length; // Multi-word matches score higher
      }
    }
    
    // Boost tree/hierarchy APIs for "full plant", "overall" queries
    if (apiDef.id.includes('tree_view') && 
        (lowerMessage.includes('plant') || lowerMessage.includes('overall') || lowerMessage.includes('full'))) {
      score += 5;
    }
    
    // Boost single-station APIs when station ID is mentioned
    if (!apiDef.id.includes('tree_view') && /station\s*\d+/i.test(message)) {
      score += 3;
    }
    
    if (score > 0) {
      scoredAPIs.push({ apiId, apiDef, score });
    }
  }
  
  // Sort by score descending
  scoredAPIs.sort((a, b) => b.score - a.score);
  
  return scoredAPIs;
}

/**
 * Pre-process user message for better routing
 * @param {string} message - Original user message
 * @param {Object} registry - API registry
 * @returns {Object} Processed message and extracted entities
 */
function preprocessMessage(message, registry) {
  const synonyms = registry.synonyms || {};
  
  // Extract station IDs
  const stationMatches = message.match(/station\s*(?:id\s*)?(\d+)/gi) || [];
  const stationIds = stationMatches.map(m => parseInt(m.match(/\d+/)[0], 10));
  
  // Extract date ranges
  const datePatterns = {
    yesterday: /\byesterday\b/i,
    today: /\btoday\b/i,
    lastNUnits: /\blast\s+(\d+)\s+(hour|day|week|month|year)s?\b/i,
    nAgo: /\b(\d+)\s+(hour|day|week|month|year)s?\s+ago\b/i,
    dateRange: /from\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i
  };
  
  const extractedDates = {};
  for (const [pattern, regex] of Object.entries(datePatterns)) {
    const match = message.match(regex);
    if (match) {
      extractedDates[pattern] = match;
    }
  }
  
  // Expand message with synonyms
  const expandedMessage = expandSynonyms(message, synonyms);
  
  return {
    originalMessage: message,
    expandedMessage,
    extractedEntities: {
      stationIds: stationIds.length > 0 ? stationIds : null,
      dates: Object.keys(extractedDates).length > 0 ? extractedDates : null
    }
  };
}

/**
 * Log routing decision for analytics/debugging
 * @param {Object} routingDecision - Full routing context
 */
function logRoutingDecision(routingDecision) {
  const { apiPlan, validation, confidence, userMessage, timestamp } = routingDecision;
  
  console.log(`[ROUTING] ${new Date(timestamp || Date.now()).toISOString()}`);
  console.log(`  Message: "${userMessage?.substring(0, 50)}..."`);
  console.log(`  API: ${apiPlan?.apiId || 'none'}`);
  console.log(`  Confidence: ${((apiPlan?.confidence ?? 1) * 100).toFixed(0)}%`);
  console.log(`  Category: ${apiPlan?.intentCategory || 'unknown'}`);
  
  if (validation?.warnings?.length > 0) {
    console.log(`  Warnings: ${validation.warnings.join('; ')}`);
  }
  
  if (validation?.missing?.length > 0) {
    console.log(`  Missing: ${validation.missing.map(p => p.name).join(', ')}`);
  }
}

module.exports = {
  expandSynonyms,
  normalizeQueryParams,
  validateRouting,
  handleLowConfidence,
  findAPIsByCategory,
  preprocessMessage,
  logRoutingDecision,
  DEFAULT_DATE_ALIASES
};
