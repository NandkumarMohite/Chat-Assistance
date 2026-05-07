// ─────────────────────────────────────────────
// routes/health.js — GET /api/health
// ─────────────────────────────────────────────

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

const { OLLAMA_BASE_URL, OLLAMA_MODEL } = require('../core/config');
const { getRegistry }                   = require('../core/registry');

router.get('/', async (req, res) => {
  const registry = getRegistry();

  let ollamaStatus   = 'disconnected';
  let availableModels = [];
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await response.json();
    ollamaStatus    = 'connected';
    availableModels = (data.models || []).map(m => m.name);
  } catch { }

  let backendStatus = 'disconnected';
  try {
    const response = await fetch(`${registry.baseUrl}/api/users`, { method: 'GET', timeout: 3000 });
    if (response.ok) backendStatus = 'connected';
  } catch { }

  res.json({
    status:         'ok',
    ollama:         ollamaStatus,
    backend:        backendStatus,
    backendUrl:     registry.baseUrl,
    model:          OLLAMA_MODEL,
    registeredAPIs: registry.apis.length,
    availableModels,
  });
});

module.exports = router;
