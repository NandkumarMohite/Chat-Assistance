// ─────────────────────────────────────────────
// routes/models.js — GET /api/models
// ─────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { fetchOllamaModels } = require('../core/ollama');

router.get('/', async (req, res) => {
  try {
    const models = await fetchOllamaModels();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: 'Cannot connect to Ollama. Make sure Ollama is running.' });
  }
});

module.exports = router;
