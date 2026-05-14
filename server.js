// ─────────────────────────────────────────────
// server.js — Application entry point
//   All business logic lives in core/ and routes/
// ─────────────────────────────────────────────

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { PORT }         = require('./core/config');
const { loadRegistry } = require('./core/registry');
const fs   = require('fs');

// ── Display Banner ───────────────────────────
try {
  const banner = fs.readFileSync(path.join(__dirname, 'Banner.txt'), 'utf8');
  console.log(banner);
} catch (e) {
  // Ignore if banner is missing
}

// ── Load API registry on startup ─────────────
// TODO: If you want to add a new API (like get_all_sellers), YOU DO NOT NEED TO EDIT ANY JS FILES!
// Just add your new API object into `api-registry.json`.
try {
  loadRegistry();
} catch (err) {
  console.error('❌ Failed to load api-registry.json:', err.message);
  process.exit(1);
}

// ── Express app setup ────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Mount routes ─────────────────────────────
app.use('/api/chat',     require('./routes/chat'));
app.use('/api/health',   require('./routes/health'));
app.use('/api/models',   require('./routes/models'));
app.use('/api/registry', require('./routes/registry'));
app.use('/api/chart-config', require('./routes/chart'));

// ── Start server ─────────────────────────────
const { OLLAMA_BASE_URL, OLLAMA_MODEL } = require('./core/config');
const { getRegistry } = require('./core/registry');

app.listen(PORT, () => {
  const registry = getRegistry();
  console.log(`\n🚀 Ollama Chat AI Server running at http://localhost:${PORT}`);
  console.log(`📡 Connected to Ollama at: ${OLLAMA_BASE_URL}`);
  console.log(`🤖 Using model: ${OLLAMA_MODEL}`);
  console.log(`🏪 Backend API: ${registry.baseUrl}`);
  console.log(`📋 Registered APIs: ${registry.apis.length} endpoints`);
  console.log(`\n💡 To change model: set OLLAMA_MODEL env variable`);
  console.log(`   Example: OLLAMA_MODEL=qwen3 node server.js\n`);
});
