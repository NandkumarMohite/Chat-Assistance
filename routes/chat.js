// ─────────────────────────────────────────────
// routes/chat.js — POST /api/chat  (SSE streaming handler)
// ─────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getRegistry, buildAPIDescription, getCacheRegistry } = require('../core/registry');
const { callOllama, extractJSON } = require('../core/ollama');
const { executeAPICall, applyClientFilter, executeDependencyChain } = require('../core/executor');
const { getCachedResponse, getCacheRegistry: getCacheRegistryFromCache } = require('../core/cacheRegistry');
const { resolveCallParams, buildClarificationMessage, enrichResponseWithNames } = require('../core/entityResolver');
const { buildClassifyPrompt, buildInterpretPrompt, buildGeneralPrompt, buildFollowUpDetectionPrompt, buildCategoryDetectionPrompt } = require('../core/prompts');
const { resolveTemporalQueryParams } = require('../core/dateRange');
const { getMockResponse } = require('../core/test-mock-data');
const { TEST_LOCALLY } = require('../core/config');
const { 
  expandSynonyms, 
  normalizeQueryParams, 
  validateRouting, 
  handleLowConfidence,
  preprocessMessage,
  logRoutingDecision,
  resolveApiIdFromRelated
} = require('../core/routingUtils');

function buildApiUrl(baseUrl, apiPath, pathParams = {}, queryParams = {}) {
  let urlPath = apiPath;
  const usedPathKeys = new Set();

  // Replace path placeholders like /lines/{lineId}
  for (const [key, val] of Object.entries(pathParams || {})) {
    const placeholder = `{${key}}`;
    if (urlPath.includes(placeholder)) {
      urlPath = urlPath.replace(placeholder, encodeURIComponent(val));
      usedPathKeys.add(key);
    }
  }

  // Backward compatibility: any pathParams key not used in path becomes query param
  const mergedQuery = { ...(queryParams || {}) };
  for (const [key, val] of Object.entries(pathParams || {})) {
    if (!usedPathKeys.has(key) && mergedQuery[key] === undefined) {
      mergedQuery[key] = val;
    }
  }

  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(mergedQuery)) {
    if (val === undefined || val === null || val === '') continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item !== undefined && item !== null && item !== '') {
          searchParams.append(key, String(item));
        }
      }
    } else {
      searchParams.append(key, String(val));
    }
  }

  const qs = searchParams.toString();
  return `${baseUrl}${urlPath}${qs ? `?${qs}` : ''}`;
}

// TODO: If you want to add a New API (like getting sellers, workers, etc.), 
// DO NOT ADD CODE HERE. The AI automatically routes requests based on `api-registry.json`.
// Just add your new API config into `api-registry.json` and the AI will handle the rest!

router.post('/', async (req, res) => {
  const { message, conversationHistory = [], jwtToken, clientTimeZone, routerModel, analyzerModel } = req.body;
  // Use client timezone, or server default from config, or fallback to UTC
  const { DEFAULT_TIMEZONE } = require('../core/config');
  const timeZone = clientTimeZone || DEFAULT_TIMEZONE || 'UTC';
  console.log(`[CHAT REQUEST] Message: "${message}"`);
  console.log(`[CHAT REQUEST] JWT Token from frontend:`, jwtToken ? jwtToken.substring(0, 20) + '...' : 'NULL or UNDEFINED');
  console.log(`[CHAT REQUEST] Client Timezone: ${timeZone}`);

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // ── Set up SSE ────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const registry = getRegistry();

    // ── STEP 0: Pre-process message with synonyms ──
    const routingConfig = {
      synonyms: registry.synonyms || {},
      intentCategories: registry.intentCategories || {},
      dateParamAliases: registry.dateParamAliases || {}
    };
    const { expandedMessage, extractedEntities } = preprocessMessage(message, registry);
    console.log(`[ROUTING] Extracted entities:`, extractedEntities);

    // ── Detect follow-up / continuation messages ──────────────────────────────
    // Two-mode detection:
    //   1. Entity clarification (rule-based): The last AI turn was a "did you mean?" prompt.
    //      Extract the original unresolved entity and substitute it directly in the original
    //      user message — gives the classifier a clean, natural query like
    //      "Give me OEE parameters for Station MB_10" instead of vague context text.
    //   2. Other short messages (LLM-based): delegate to buildFollowUpDetectionPrompt so the
    //      model can detect time refinements, modifier changes, filter changes, etc.
    let effectiveMessage = expandedMessage;
    // Declared here (before the detection block) to avoid temporal dead zone —
    // the assignment inside the if-block below would throw TDZ if declared later.
    let confirmedEntityNames = [];
    if (conversationHistory && conversationHistory.length >= 2) {
      const lastAiMsg   = [...conversationHistory].reverse().find(m => m.role === 'assistant');
      // Skip the current message itself — the frontend often includes the current user turn
      // in the history array, so a plain .find() would return it instead of the original request.
      const lastUserMsg = [...conversationHistory].reverse().find(
        m => m.role === 'user' && m.content.trim() !== message.trim()
      );

      if (lastUserMsg?.content) {
        const trimmed = message.trim();

        // ── Mode 1: Entity clarification ─────────────────────────────────────
        // Detect the "did you mean?" / "couldn't find" pattern from buildClarificationMessage.
        const wasClarification = lastAiMsg?.content && (
          lastAiMsg.content.includes('did you mean') ||
          lastAiMsg.content.includes('Did you mean') ||
          lastAiMsg.content.includes("couldn't find an exact match") ||
          lastAiMsg.content.includes('closest matches') ||
          lastAiMsg.content.includes('Please reply using the exact name')
        );

        if (wasClarification) {
            // Only treat as clarification if reply is likely an entity name (short, no spaces, matches pattern)
            // e.g., MB_50, M_1, etc. (max 3 words, no spaces, max 20 chars)
            const isEntityLike = trimmed.length <= 20 && trimmed.split(/\s+/).length === 1 && /[A-Za-z0-9_\-]+/.test(trimmed);
            if (isEntityLike) {
              const entityMatch =
                lastAiMsg.content.match(/🔍 \*\*"([^"]+)"\*\*/i) ||
                lastAiMsg.content.match(/matching \*\*"([^"]+)"\*\*/i) ||
                lastAiMsg.content.match(/\*\*"([^"]+)"\*\*[^*]*did you mean/i);
              const originalEntity = entityMatch?.[1];

              if (originalEntity) {
                // Replace the original entity in the original user message with what the user just typed.
                const escaped = originalEntity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const replaced = lastUserMsg.content.replace(new RegExp(escaped, 'gi'), trimmed);
                effectiveMessage = replaced !== lastUserMsg.content
                  ? replaced
                  : `${lastUserMsg.content} (the entity "${originalEntity}" should be treated as "${trimmed}")`;
              } else {
                effectiveMessage = `${lastUserMsg.content} (use "${trimmed}" as the station/line/entity name)`;
              }
              console.log(`[FOLLOW-UP] Entity clarification: "${originalEntity || '?'}" → "${trimmed}"`);
              console.log(`[FOLLOW-UP] Reconstructed: "${effectiveMessage}"`);
              confirmedEntityNames = [trimmed]; // trust this name in the resolver step
            } else {
              // Not an entity-like reply, treat as new request (skip clarification logic)
              // No changes to effectiveMessage or confirmedEntityNames
              console.log(`[FOLLOW-UP] Skipped clarification: reply not entity-like ("${trimmed}")`);
            }
        }
        // ── Mode 2: Short message — let LLM decide (time, modifier, filter, etc.) ──
        else if (trimmed.split(/\s+/).length <= 8) {
          try {
            const followUpContext = `PREVIOUS USER REQUEST: "${lastUserMsg.content}"\nNEW MESSAGE: "${trimmed}"`;
            const followUpResult  = await callOllama(
              buildFollowUpDetectionPrompt(),
              followUpContext,
              false,
              routerModel || null
            );
            const followUpParsed = extractJSON(followUpResult.content);
            if (followUpParsed?.isFollowUp === true && followUpParsed.reconstructedMessage) {
              effectiveMessage = followUpParsed.reconstructedMessage;
              console.log(`[FOLLOW-UP] ${followUpParsed.followUpType}: ${followUpParsed.reason}`);
              console.log(`[FOLLOW-UP] Reconstructed → "${effectiveMessage}"`);
            } else {
              console.log(`[FOLLOW-UP] Standalone request — no reconstruction needed.`);
            }
          } catch (err) {
            console.warn(`[FOLLOW-UP] LLM detection failed, using original message:`, err.message);
          }
        }
      }
    }

    // ── STEP 1: Classify intent & pick API / chain ──
    send('status', { step: 'classify', message: '🧠 Understanding your question...' });

    // Pre-filter APIs using LLM-based category detection
    let apiDescriptionOptions = {};
    const intentCategories = registry.intentCategories || {};
    
    if (Object.keys(intentCategories).length > 0) {
      try {
        console.log(`[PRE-FILTER] Using LLM to detect category...`);
        const categoryResult = await callOllama(
          buildCategoryDetectionPrompt(intentCategories),
          effectiveMessage,
          false,
          routerModel || null
        );
        
        const categoryParsed = extractJSON(categoryResult.content);
        if (categoryParsed?.category && categoryParsed.category !== 'general' && categoryParsed.confidence >= 0.7) {
          console.log(`[PRE-FILTER] LLM detected category: "${categoryParsed.category}" (confidence: ${(categoryParsed.confidence * 100).toFixed(0)}%, reason: ${categoryParsed.reason})`);
          
          // Verify category exists in registry
          if (intentCategories[categoryParsed.category]) {
            apiDescriptionOptions.category = categoryParsed.category;
            console.log(`[PRE-FILTER] Filtering API list to category: ${categoryParsed.category}`);
          } else {
            console.log(`[PRE-FILTER] Category "${categoryParsed.category}" not in registry, sending full API list`);
          }
        } else {
          console.log(`[PRE-FILTER] LLM result: category=${categoryParsed?.category}, confidence=${categoryParsed?.confidence} - sending full API list`);
        }
      } catch (err) {
        console.warn(`[PRE-FILTER] LLM category detection failed, sending full API list:`, err.message);
      }
    }

    const chainDescriptions = (registry.dependencyChains || [])
      .map(c => `  - ${c.id}: ${c.triggerCondition}`)
      .join('\n');

    const classifyResult = await callOllama(
      buildClassifyPrompt(buildAPIDescription(apiDescriptionOptions), chainDescriptions, routingConfig),
      effectiveMessage,
      false,
      routerModel || null
    );
    console.log(`[ROUTING] Using router model: ${routerModel || 'default'}`);

    let requiresAPI = false;
    let apiPlan = null;

    try {
      const parsed = extractJSON(classifyResult.content);
      if (parsed) {
        requiresAPI = parsed.requiresAPI === true;
        apiPlan = parsed;
        
        // Log the routing decision
        console.log(`[ROUTING] Confidence: ${((apiPlan.confidence ?? 1) * 100).toFixed(0)}%`);
        console.log(`[ROUTING] Intent Category: ${apiPlan.intentCategory || 'unknown'}`);
        console.log(`[ROUTING] API: ${apiPlan.apiId || apiPlan.chainId || 'none'}`);
        if (apiPlan.calls && apiPlan.calls.length > 0) {
          console.log(`[ROUTING] Query Params from LLM:`, JSON.stringify(apiPlan.calls[0].queryParams, null, 2));
        }
      }
    } catch {
      // Fallback: keyword match
      const allKeywords = registry.apis.flatMap(a => a.keywords || []);
      requiresAPI = allKeywords.some(k => message.toLowerCase().includes(k.toLowerCase()));
    }

    let apiResults = [];
    let apiCallsMade = [];
    let clarificationSent = false;

    if (requiresAPI && apiPlan) {
      // ── Handle low confidence routing ──────────────
      const confidenceThreshold = registry.routingConfig?.confidenceThreshold || 0.7;
      const confidenceResult = handleLowConfidence(apiPlan, confidenceThreshold);
      
      if (confidenceResult.message) {
        console.log(`[ROUTING] ${confidenceResult.message}`);
        if (confidenceResult.needsClarification) {
          send('status', { step: 'low_confidence', message: `⚠️ ${confidenceResult.message}` });
        }
      }

      // ── STEP 2: Plan & execute ─────────────────────
      send('status', { step: 'plan_api', message: '⚙️ Planning API calls...' });

      // ── Dependency chain path ─────────────────────
      if (apiPlan.chainId) {
        const chain = (registry.dependencyChains || []).find(c => c.id === apiPlan.chainId);
        if (chain) {
          send('status', { step: 'chain_start', message: `🔗 Running dependency chain: ${chain.id}...` });
          try {
            apiResults = await executeDependencyChain(chain, message, jwtToken, send, timeZone);
            apiCallsMade = apiResults;
          } catch (chainErr) {
            send('error_partial', { message: `Chain error: ${chainErr.message}` });
            apiResults.push({ error: chainErr.message });
          }
        }
      }

      // ── Direct API call(s) path ───────────────────
      const callsToMake = !apiPlan.chainId && apiPlan.multipleAPIs && apiPlan.apiCalls?.length
        ? apiPlan.apiCalls
        : !apiPlan.chainId
          ? [{ apiId: apiPlan.apiId, pathParams: apiPlan.pathParams, queryParams: apiPlan.queryParams, requestBody: apiPlan.requestBody, clientFilter: apiPlan.clientFilter }]
          : [];

      for (const call of callsToMake) {
        // Look up API definition in main registry first, then cache registry
        let apiDef = registry.apis.find(a => a.id === call.apiId);
        let isFromCacheRegistry = false;
        
        if (!apiDef) {
          // Try cache registry
          const cacheRegistry = getCacheRegistry();
          if (cacheRegistry && Array.isArray(cacheRegistry.apis)) {
            apiDef = cacheRegistry.apis.find(a => a.id === call.apiId);
            if (apiDef) {
              isFromCacheRegistry = true;
              console.log(`[ROUTING] Found API ${call.apiId} in cache registry`);
            }
          }
        }

        // Fallback: the LLM may have picked an id that is only listed inside another
        // API's `relatedAPIs`. Map it back to the parent API that owns it.
        if (!apiDef) {
          const cacheRegistry = getCacheRegistry();
          const resolvedId = resolveApiIdFromRelated(
            call.apiId,
            registry.apis,
            cacheRegistry?.apis
          );
          if (resolvedId) {
            console.log(`[ROUTING] Resolved unknown apiId "${call.apiId}" -> parent "${resolvedId}" via relatedAPIs`);
            call.apiId = resolvedId;
            apiDef = registry.apis.find(a => a.id === resolvedId);
            if (!apiDef && cacheRegistry && Array.isArray(cacheRegistry.apis)) {
              apiDef = cacheRegistry.apis.find(a => a.id === resolvedId);
              if (apiDef) isFromCacheRegistry = true;
            }
          }
        }

        if (!apiDef) {
          send('error_partial', { message: `Unknown API: ${call.apiId}` });
          continue;
        }

        // ── Validate routing decision ──────────────────
        const validation = validateRouting(call, apiDef, message);
        if (!validation.valid) {
          console.log(`[ROUTING VALIDATION] Warnings: ${validation.warnings.join('; ')}`);
          // Log missing params but don't block - let the API return an error if needed
          if (validation.missing.length > 0) {
            send('status', { 
              step: 'validation_warning', 
              message: `⚠️ Missing parameters: ${validation.missing.map(p => p.name).join(', ')}. Using defaults.`
            });
          }
        }
        
        // Log routing decision
        logRoutingDecision({
          apiPlan: call,
          validation,
          confidence: apiPlan.confidence,
          userMessage: message,
          timestamp: Date.now()
        });

        // ── Resolve entity names → IDs using cache ─────
        // e.g. stationId: "OP101" → stationId: 21
        send('status', { step: 'entity_resolve', message: '🔎 Resolving entity names...' });
        const entityResolution = resolveCallParams(call.pathParams || {}, call.queryParams || {}, { confirmedNames: confirmedEntityNames });

        if (entityResolution.clarifications.length > 0) {
          // Ambiguous or unknown entity — ask user for clarification instead of calling the API
          const clarifyMsg = buildClarificationMessage(entityResolution.clarifications);
          console.log(`[ENTITY RESOLVER] Clarification needed:`, entityResolution.clarifications.map(c => c.query));
          send('answer', { content: clarifyMsg });
          send('done', { requiresAPI: true, apisCalled: [], totalResults: 0, clarification: true });
          clarificationSent = true;
          break;
        }

        // Use entity-resolved params going forward
        const effectivePathParams  = entityResolution.resolvedPathParams;
        const effectiveQueryParams = entityResolution.resolvedQueryParams;

        // ── Normalize query params for this API ────────
        const normalizedApiParams = normalizeQueryParams(
          apiDef,
          effectiveQueryParams,
          routingConfig.dateParamAliases
        );
        
        // Resolve temporal values (yesterday, last week, etc.)
        const resolvedQueryParams = resolveTemporalQueryParams(normalizedApiParams, timeZone);
        console.log(`[DATE RESOLUTION] Timezone: ${timeZone}`);
        console.log(`[DATE RESOLUTION] Before (local):`, normalizedApiParams);
        console.log(`[DATE RESOLUTION] After (UTC):`, resolvedQueryParams);
        
        // Use appropriate baseUrl depending on source registry
        const baseUrlToUse = isFromCacheRegistry 
          ? (getCacheRegistry()?.baseUrl || registry.baseUrl)
          : registry.baseUrl;
        const fullUrl = buildApiUrl(baseUrlToUse, apiDef.path, effectivePathParams, resolvedQueryParams);

        const apiCallInfo = { apiId: call.apiId, name: apiDef.name, method: apiDef.method, url: fullUrl, body: call.requestBody || null };

        send('api_call', { method: apiDef.method, url: fullUrl, body: call.requestBody || null, name: apiDef.name });
        
        // For cache registry APIs, prioritize cache lookup
        if (isFromCacheRegistry) {
          send('status', { step: 'cache_lookup', message: `⚡ Looking up cached ${apiDef.name}...` });
        } else {
          send('status', { step: 'execute', message: TEST_LOCALLY ? `🧪 [MOCK] Loading ${apiDef.name}...` : `🔍 Calling ${apiDef.name}...` });
        }

        try {
          let result;
          if (TEST_LOCALLY) {
            result = getMockResponse(call.apiId);
            console.log(`[TEST_LOCALLY] Using mock data for: ${call.apiId}`);
          } else {
            // Always check cache first (especially important for cache registry APIs)
            const cached = getCachedResponse(call.apiId, fullUrl);
            if (cached) {
              send('status', { step: 'cache', message: `⚡ Using cached ${apiDef.name}...` });
              console.log(`[CACHE HIT] Serving ${call.apiId} from cache`);
              result = cached.data;
            } else if (isFromCacheRegistry) {
              // Cache registry API but no cache - try to call API anyway
              console.log(`[CACHE MISS] ${call.apiId} is a cache registry API but not cached, calling backend...`);
              send('status', { step: 'execute', message: `🔍 Cache miss, calling ${apiDef.name}...` });
              result = await executeAPICall(apiCallInfo, jwtToken);
            } else {
              result = await executeAPICall(apiCallInfo, jwtToken);
            }
          }

          // Auth token from login/register responses
          if (result && result.token) {
            send('auth_token', { token: result.token });
          }

          let resultArray = Array.isArray(result) ? result : [result];

          // Apply client-side filter if requested
          if (call.clientFilter) {
            resultArray = applyClientFilter(resultArray, call.clientFilter, send);
          }

          // Enrich response: add name fields for any ID-only fields (stationId → stationName etc.)
          resultArray = enrichResponseWithNames(resultArray);

          apiResults.push({ apiId: call.apiId, name: apiDef.name, data: resultArray });
          apiCallsMade.push(apiCallInfo);

          // Send data with API metadata for period comparison feature
          const metadata = {
            apiId: call.apiId,
            pathParams: call.pathParams || {},
            queryParams: resolvedQueryParams || {}
          };
          // Add displayData if present in API definition
          if (apiDef.displayData) {
            metadata.displayData = apiDef.displayData;
          }
          console.log(`[METADATA] Sending to frontend:`, JSON.stringify(metadata, null, 2));

          send('data', {
            rows: resultArray,
            count: resultArray.length,
            apiName: apiDef.name,
            // Store API call info for frontend to reuse in period comparison
            metadata
          });

        } catch (apiErr) {
          if (apiErr.message === 'UNAUTHORIZED_OR_FORBIDDEN') {
            send('error_partial', {
              message: `🔒 Authentication Required for ${apiDef.name}. Please sign in.`,
              api: fullUrl,
            });
            apiResults.push({ apiId: call.apiId, name: apiDef.name, error: 'Requires authentication. Tell the user to sign in with their email and password.' });
          } else {
            send('error_partial', { message: `API Error (${apiDef.name}): ${apiErr.message}`, api: fullUrl });
            apiResults.push({ apiId: call.apiId, name: apiDef.name, error: apiErr.message });
          }
        }
      }
    }

    // ── STEP 3: Generate human-readable response ──
    // Skip if clarification was already sent to the user
    if (clarificationSent) return res.end();

    send('status', { step: 'interpret', message: '💬 Crafting your answer...' });

    const interpretPrompt = requiresAPI
      ? buildInterpretPrompt(message, apiResults)
      : buildGeneralPrompt(message, conversationHistory);

    console.log(`[INTERPRET] Using analyzer model: ${analyzerModel || 'default'}`);
    const interpretResult = await callOllama(interpretPrompt, '', false, analyzerModel || null);

    if (interpretResult.thinking) {
      send('thinking', { content: interpretResult.thinking });
    }

    send('answer', { content: interpretResult.content });
    send('done', {
      requiresAPI,
      apisCalled: apiCallsMade.map(a => ({ method: a.method, url: a.url, name: a.name })),
      totalResults: apiResults.reduce((sum, r) => {
        const d = r.data;
        return sum + (Array.isArray(d) ? d.length : d ? 1 : 0);
      }, 0),
    });

  } catch (err) {
    console.error('Chat error:', err);
    send('error', { message: err.message || 'An unexpected error occurred.' });
  } finally {
    res.end();
  }
});

// ─────────────────────────────────────────────
// POST /api/compare-period — Period-over-period comparison
// ─────────────────────────────────────────────
router.post('/compare-period', async (req, res) => {
  const { apiId, pathParams = {}, queryParams = {}, userMessage, jwtToken, clientTimeZone, analyzerModel } = req.body;
  const { DEFAULT_TIMEZONE } = require('../core/config');
  const timeZone = clientTimeZone || DEFAULT_TIMEZONE || 'UTC';

  console.log(`[COMPARE-PERIOD] API: ${apiId}, Params:`, queryParams);

  if (!apiId) {
    return res.status(400).json({ success: false, error: 'apiId is required' });
  }

  try {
    const registry = getRegistry();
    const { calculatePreviousPeriod } = require('../core/dateRange');
    const { buildComparisonPrompt } = require('../core/prompts');

    const apiDef = registry.apis.find(a => a.id === apiId);
    if (!apiDef) {
      return res.status(404).json({ success: false, error: `API ${apiId} not found in registry` });
    }

    // Detect date parameter keys in queryParams
    const dateKeys = ['from', 'to', 'start', 'end', 'startDate', 'endDate', 'dateFrom', 'dateTo'];
    const fromKeys = ['from', 'start', 'startDate', 'dateFrom'];
    const toKeys = ['to', 'end', 'endDate', 'dateTo'];
    const fromKey = fromKeys.find(k => queryParams[k] !== undefined && queryParams[k] !== null && queryParams[k] !== '');
    const toKey = toKeys.find(k => queryParams[k] !== undefined && queryParams[k] !== null && queryParams[k] !== '');

    console.log(`[COMPARE-PERIOD] fromKey=${fromKey} (${queryParams[fromKey]}), toKey=${toKey} (${queryParams[toKey]})`);
    console.log(`[COMPARE-PERIOD] All queryParams:`, JSON.stringify(queryParams));

    if (!fromKey || !toKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Date range parameters (from/to or start/end) are required for period comparison' 
      });
    }

    const currentFrom = queryParams[fromKey];
    const currentTo = queryParams[toKey];

    if (!currentFrom || !currentTo) {
      return res.status(400).json({ 
        success: false, 
        error: `Date values are empty. fromKey=${fromKey} value=${currentFrom}, toKey=${toKey} value=${currentTo}` 
      });
    }

    // Calculate previous period
    const prevPeriod = calculatePreviousPeriod(currentFrom, currentTo, timeZone);

    if (!prevPeriod || !prevPeriod.from || !prevPeriod.to) {
      return res.status(400).json({ 
        success: false, 
        error: `Could not calculate previous period from "${currentFrom}" to "${currentTo}"` 
      });
    }

    // Build API URLs for both periods
    const currentUrl = buildApiUrl(registry.baseUrl, apiDef.path, pathParams, queryParams);
    const prevQueryParams = { ...queryParams, [fromKey]: prevPeriod.from, [toKey]: prevPeriod.to };
    const prevUrl = buildApiUrl(registry.baseUrl, apiDef.path, pathParams, prevQueryParams);

    console.log(`[COMPARE-PERIOD] Current: ${currentFrom} to ${currentTo}`);
    console.log(`[COMPARE-PERIOD] Previous: ${prevPeriod.from} to ${prevPeriod.to} (${prevPeriod.duration})`);

    // Call API for both periods
    let currentData, previousData;

    if (TEST_LOCALLY) {
      // In test mode, use mock data (same for both periods - in real scenario these would differ)
      currentData = getMockResponse(apiId);
      previousData = getMockResponse(apiId);
      console.log(`[COMPARE-PERIOD] Using mock data for both periods`);
    } else {
      const currentCall = { apiId, name: apiDef.name, method: apiDef.method, url: currentUrl, body: null };
      const prevCall = { apiId, name: apiDef.name, method: apiDef.method, url: prevUrl, body: null };

      [currentData, previousData] = await Promise.all([
        executeAPICall(currentCall, jwtToken),
        executeAPICall(prevCall, jwtToken)
      ]);
    }

    // Normalize to arrays
    const currentArray = Array.isArray(currentData) ? currentData : [currentData];
    const prevArray = Array.isArray(previousData) ? previousData : [previousData];

    // Build comparison prompt
    const comparisonPrompt = buildComparisonPrompt(
      userMessage || 'Compare data',
      currentArray,
      prevArray,
      {
        current: { from: currentFrom, to: currentTo },
        previous: { from: prevPeriod.from, to: prevPeriod.to },
        duration: prevPeriod.duration
      }
    );

    // Call Ollama for analysis
    const analysisResult = await callOllama(comparisonPrompt, '', false, analyzerModel || null);

    res.json({
      success: true,
      analysis: analysisResult.content,
      thinking: analysisResult.thinking || null,
      periods: {
        current: { from: currentFrom, to: currentTo, recordCount: currentArray.length },
        previous: { from: prevPeriod.from, to: prevPeriod.to, recordCount: prevArray.length },
        duration: prevPeriod.duration
      }
    });

  } catch (err) {
    console.error('[COMPARE-PERIOD] Error:', err);
    res.status(500).json({ success: false, error: err.message || 'Comparison failed' });
  }
});

module.exports = router;
