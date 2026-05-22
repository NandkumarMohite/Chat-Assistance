// ─────────────────────────────────────────────
// core/registry.js — Load, cache, and describe the API registry
// ─────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', 'api-registry.json');

let API_REGISTRY = null;

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
  return API_REGISTRY;
}

// ── Get currently loaded registry ────────────
function getRegistry() {
  return API_REGISTRY;
}

// ── Build a full text description of the API surface for the LLM ──
function buildAPIDescription() {
  const registry = getRegistry();

  let desc = `You have access to a REST API service called "${registry.serviceName}".\n`;
  desc += `${registry.description}\n`;
  desc += `Base URL: ${registry.baseUrl}\n\n`;
  desc += `Available API endpoints:\n\n`;

  for (const api of registry.apis) {
    desc += `─── ${api.id} ───\n`;
    desc += `  Name: ${api.name}\n`;
    if (api.category) desc += `  Category: ${api.category}\n`;
    if (api.priority) desc += `  Priority: ${api.priority} (lower = preferred)\n`;
    desc += `  Description: ${api.description}\n`;
    desc += `  Method: ${api.method}\n`;
    desc += `  Path: ${api.path}\n`;

    // Station scope routing info
    if (api.stationScope) {
      const scope = api.stationScope;
      const supports = [];
      if (scope.singleStation) supports.push('single stationId');
      if (scope.multipleStations) supports.push('multiple stationIds');
      if (scope.allStations) supports.push('all stations (omit param)');
      desc += `  Station Scope: ${supports.join(' | ')} [param: ${scope.paramName} (${scope.paramType})]\n`;
      desc += `  Station Note: ${scope.note}\n`;
    }

    // Disambiguation hints
    if (api.disambiguationHints && api.disambiguationHints.length > 0) {
      desc += `  When to use:\n`;
      for (const hint of api.disambiguationHints) {
        desc += `    • ${hint}\n`;
      }
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

    // DO NOT USE FOR - negative keywords to prevent wrong API selection
    if (api.doNotUseFor && api.doNotUseFor.length > 0) {
      desc += `  DO NOT use for: ${api.doNotUseFor.join(', ')}\n`;
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

module.exports = { loadRegistry, reloadRegistry, getRegistry, buildAPIDescription };
