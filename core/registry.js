// ─────────────────────────────────────────────
// core/registry.js — Load, cache, and describe the API registry
// ─────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', 'api-registry.json');
const CACHE_REGISTRY_PATH = path.join(__dirname, '..', 'api-registry-cache-api.json');

let API_REGISTRY = null;
let CACHE_REGISTRY = null;

// ── Load registry from disk ──────────────────
// TODO: If you want to add a New API, you DO NOT need to write any JavaScript!
// Just add the new API object to the "apis" array inside `api-registry.json`.
function loadRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  API_REGISTRY = JSON.parse(raw);
  
  // Override baseUrl from environment if provided (useful for Docker/microservices)
  if (process.env.BACKEND_URL) {
    API_REGISTRY.baseUrl = process.env.BACKEND_URL;
  }
  
  console.log(`✅ Loaded API registry: ${API_REGISTRY.apis.length} endpoints from ${API_REGISTRY.serviceName}`);

  // Also load cache registry for merged API descriptions
  try {
    const cacheRaw = fs.readFileSync(CACHE_REGISTRY_PATH, 'utf-8');
    CACHE_REGISTRY = JSON.parse(cacheRaw);
    if (process.env.BACKEND_URL) {
      CACHE_REGISTRY.baseUrl = process.env.BACKEND_URL;
    }
    const cacheApiCount = CACHE_REGISTRY.apis ? CACHE_REGISTRY.apis.length : 0;
    console.log(`✅ Loaded cache registry: ${cacheApiCount} cacheable endpoints`);
  } catch (err) {
    console.warn(`⚠️ Could not load cache registry: ${err.message}`);
    CACHE_REGISTRY = null;
  }
  

  return API_REGISTRY;
}

// ── Hot-reload registry without restarting server ──
function reloadRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  API_REGISTRY = JSON.parse(raw);

  // Override baseUrl from environment if provided
  if (process.env.BACKEND_URL) {
    API_REGISTRY.baseUrl = process.env.BACKEND_URL;
  }

  console.log(`🔄 API registry reloaded: ${API_REGISTRY.apis.length} endpoints`);

  // Also reload cache registry
  try {
    const cacheRaw = fs.readFileSync(CACHE_REGISTRY_PATH, 'utf-8');
    CACHE_REGISTRY = JSON.parse(cacheRaw);
    if (process.env.BACKEND_URL) {
      CACHE_REGISTRY.baseUrl = process.env.BACKEND_URL;
    }
    const cacheApiCount = CACHE_REGISTRY.apis ? CACHE_REGISTRY.apis.length : 0;
    console.log(`🔄 Cache registry reloaded: ${cacheApiCount} cacheable endpoints`);
  } catch (err) {
    console.warn(`⚠️ Could not reload cache registry: ${err.message}`);
  }

  return API_REGISTRY;
}

// ── Get currently loaded registry ────────────
function getRegistry() {
  return API_REGISTRY;
}

// ── Get currently loaded cache registry ──────
function getCacheRegistry() {
  return CACHE_REGISTRY;
}

// ── Build a full text description of the API surface for the LLM ──
// options.category - only include APIs from this category (optional)
// options.apiIds - only include these specific API ids (optional)
function buildAPIDescription(options = {}) {
  const registry = getRegistry();
  const { category: filterCategory, apiIds: filterApiIds } = options;

  let desc = `You have access to a REST API service called "${registry.serviceName}".\n`;
  desc += `${registry.description}\n`;
  desc += `Base URL: ${registry.baseUrl}\n\n`;
  
  // If filtering is active, mention it
  if (filterCategory) {
    desc += `[PRE-FILTERED: Showing APIs for category "${filterCategory}"]\n\n`;
  }
  
  desc += `Available API endpoints:\n\n`;

  // Filter APIs if category or apiIds specified
  let apisToShow = registry.apis;
  if (filterCategory) {
    const categoryApiIds = registry.intentCategories?.[filterCategory] || [];
    apisToShow = registry.apis.filter(api => 
      api.category?.toLowerCase() === filterCategory.toLowerCase() ||
      categoryApiIds.includes(api.id)
    );
  }
  if (filterApiIds && filterApiIds.length > 0) {
    apisToShow = apisToShow.filter(api => filterApiIds.includes(api.id));
  }

  for (const api of apisToShow) {
    desc += `─── ${api.id} ───\n`;
    desc += `  Name: ${api.name}\n`;
    if (api.category) desc += `  Category: ${api.category}\n`;
    if (api.priority) desc += `  Priority: ${api.priority} (lower = preferred)\n`;
    
    // Level field - indicates what scope/level this API operates at
    if (api.level && api.level.length > 0) {
      desc += `  Level: ${api.level.join(', ')}\n`;
    }
    
    desc += `  Description: ${api.description}\n`;
    desc += `  Method: ${api.method}\n`;
    desc += `  Path: ${api.path}\n`;

    // Disambiguation hints
    if (api.disambiguationHints && api.disambiguationHints.length > 0) {
      desc += `  When to use:\n`;
      for (const hint of api.disambiguationHints) {
        desc += `    • ${hint}\n`;
      }
    }

    // Example queries that should match this API
    if (api.exampleQueries && api.exampleQueries.length > 0) {
      desc += `  Example queries:\n`;
      for (const example of api.exampleQueries) {
        desc += `    ✓ "${example}"\n`;
      }
    }

    // Queries that should NOT match this API
    if (api.notForQueries && api.notForQueries.length > 0) {
      desc += `  NOT for these queries:\n`;
      for (const notFor of api.notForQueries) {
        desc += `    ✗ "${notFor}"\n`;
      }
    }

    // Prefer this API over others in certain cases
    if (api.preferOver && api.preferOver.length > 0) {
      desc += `  Prefer this over: ${api.preferOver.join(', ')}\n`;
    }
    if (api.preferWhen) {
      desc += `  Prefer when: ${api.preferWhen}\n`;
    }

    if (api.parameters && api.parameters.length > 0) {
      desc += `  Path Parameters:\n`;
      for (const p of api.parameters) {
        desc += `    - ${p.name} (${p.type}, ${p.required ? 'required' : 'optional'}): ${p.description}\n`;
      }
    }

    if (api.requestBody) {
      desc += `  Request Body (${api.requestBody.type}):\n`;
      for (const f of api.requestBody.fields) {
        desc += `    - ${f.name} (${f.type}${f.required ? ', required' : ''}): ${f.description}\n`;
      }
    }

    if (api.keywords) {
      desc += `  Trigger keywords/phrases: ${api.keywords.join(', ')}\n`;
    }

    if (api.responseHints) {
      desc += `  Response contains: ${api.responseHints.join(', ')}\n`;
    }

    // Extract field names from responseExample to help model understand what data this API returns
    if (api.responseExample) {
      const fields = extractFieldNames(api.responseExample);
      if (fields.length > 0) {
        desc += `  Response fields: ${fields.slice(0, 15).join(', ')}${fields.length > 15 ? '...' : ''}\n`;
      }
    }

    if (api.canBeUsedFor && api.canBeUsedFor.length > 0) {
      desc += `  Can be used for: ${api.canBeUsedFor.join(', ')}\n`;
    }

    if (api.relatedAPIs && api.relatedAPIs.length > 0) {
      desc += `  Related APIs: ${api.relatedAPIs.join(', ')}\n`;
    }

    desc += `\n`;
  }

  // Include dependency chain descriptions
  if (registry.dependencyChains && registry.dependencyChains.length > 0) {
    desc += `\n── DEPENDENCY CHAINS (multi-step workflows) ──\n`;
    desc += `Use these when the user identifies an entity by a non-ID field (e.g. phone, email, name).\n\n`;
    for (const chain of registry.dependencyChains) {
      desc += `  Chain: ${chain.id}\n`;
      desc += `  Use when: ${chain.triggerCondition}\n`;
      desc += `  Steps: ${chain.steps.map((s, i) => `${i + 1}) ${s.apiId}${s.filterBy ? ` (filter by ${s.filterBy})` : ''}`).join(' → ')}\n\n`;
    }
  }

  // Include cacheable APIs from cache registry (master/configuration data)
  // Only include if no category filter, or if category is 'configuration'
  const cacheRegistry = getCacheRegistry();
  const includeCacheApis = !filterCategory || filterCategory.toLowerCase() === 'configuration';
  
  if (includeCacheApis && cacheRegistry && Array.isArray(cacheRegistry.apis) && cacheRegistry.apis.length > 0) {
    desc += `\n── CACHEABLE CONFIGURATION APIs (served from cache for fast response) ──\n`;
    desc += `These APIs return master/configuration data and are pre-cached. Use these when user asks for lists of stations, lines, alarms, etc.\n\n`;

    for (const api of cacheRegistry.apis) {
      desc += `─── ${api.id} [CACHED] ───\n`;
      desc += `  Name: ${api.name}\n`;
      if (api.category) desc += `  Category: ${api.category}\n`;
      desc += `  Description: ${api.description}\n`;
      desc += `  Method: ${api.method}\n`;
      desc += `  Path: ${api.path}\n`;
      desc += `  Data Source: CACHE (fast, pre-loaded)\n`;

      if (api.parameters && api.parameters.length > 0) {
        desc += `  Parameters:\n`;
        for (const p of api.parameters) {
          desc += `    - ${p.name} (${p.type}, ${p.required ? 'required' : 'optional'}): ${p.description}\n`;
        }
      }

      if (api.keywords) {
        desc += `  Trigger keywords/phrases: ${api.keywords.join(', ')}\n`;
      }

      if (api.responseExample) {
        const fields = extractFieldNames(api.responseExample);
        if (fields.length > 0) {
          desc += `  Response fields: ${fields.slice(0, 15).join(', ')}${fields.length > 15 ? '...' : ''}\n`;
        }
      }

      if (api.canBeUsedFor && api.canBeUsedFor.length > 0) {
        desc += `  Can be used for: ${api.canBeUsedFor.join(', ')}\n`;
      }

      if (api.relatedAPIs && api.relatedAPIs.length > 0) {
        desc += `  Related APIs: ${api.relatedAPIs.join(', ')}\n`;
      }

      desc += `\n`;
    }
  }

  return desc;
}

// ── Extract field names from a response example (recursive) ──
function extractFieldNames(obj, prefix = '', depth = 0) {
  if (depth > 2) return []; // Limit depth to avoid too much noise
  const fields = [];
  
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      fields.push(...extractFieldNames(obj[0], prefix, depth));
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      fields.push(prefix ? `${prefix}.${key}` : key);
      const val = obj[key];
      if (typeof val === 'object' && val !== null) {
        fields.push(...extractFieldNames(val, key, depth + 1));
      }
    }
  }
  
  return [...new Set(fields)]; // Remove duplicates
}

module.exports = { loadRegistry, reloadRegistry, getRegistry, getCacheRegistry, buildAPIDescription };
