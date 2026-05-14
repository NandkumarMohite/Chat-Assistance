// ─────────────────────────────────────────────
// routes/registry.js — GET /api/registry  &  POST /api/registry/reload
// ─────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { getRegistry, reloadRegistry } = require('../core/registry');

// ── Return a summary of registered APIs ──────
router.get('/', (req, res) => {
  const registry = getRegistry();
  res.json({
    serviceName: registry.serviceName,
    baseUrl:     registry.baseUrl,
    apis: registry.apis.map(a => ({
      id:          a.id,
      name:        a.name,
      method:      a.method,
      path:        a.path,
      description: a.description,
    })),
  });
});

// ── Hot-reload the registry without restarting ──
router.post('/reload', (req, res) => {
  try {
    const registry = reloadRegistry();
    res.json({ message: 'Registry reloaded', count: registry.apis.length });
  } catch (err) {
    res.status(500).json({ error: `Failed to reload: ${err.message}` });
  }
});

module.exports = router;
