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
  console.log(`✅ Loaded API registry: ${API_REGISTRY.apis.length} endpoints from ${API_REGISTRY.serviceName}`);
  return API_REGISTRY;
}

// ── Hot-reload registry without restarting server ──
function reloadRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  API_REGISTRY = JSON.parse(raw);
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
    desc += `  Description: ${api.description}\n`;
    desc += `  Method: ${api.method}\n`;
    desc += `  Path: ${api.path}\n`;

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
      desc += `  Trigger keywords: ${api.keywords.join(', ')}\n`;
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

module.exports = { loadRegistry, reloadRegistry, getRegistry, buildAPIDescription };
