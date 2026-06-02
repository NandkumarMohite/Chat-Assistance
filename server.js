// ─────────────────────────────────────────────
// server.js — Application entry point
//   All business logic lives in core/ and routes/
// ─────────────────────────────────────────────

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { PORT }         = require('./core/config');
const { loadRegistry } = require('./core/registry');
const { loadCacheRegistry, startCacheScheduler } = require('./core/cacheRegistry');
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

// ── Load cache registry and start auto-refresh ─────────────
try {
  loadCacheRegistry();
  startCacheScheduler();
} catch (err) {
  console.error('⚠️ Failed to initialize cache registry:', err.message);
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
app.use('/api/analyze-data', require('./routes/analyze'));

// ── Start server ─────────────────────────────
const { OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_ROUTER_MODEL, OLLAMA_ANALYZER_MODEL } = require('./core/config');
const { getRegistry } = require('./core/registry');

app.listen(PORT, () => {
  const registry = getRegistry();
  console.log(`\n🚀 Ollama Chat AI Server running at http://localhost:${PORT}`);
  console.log(`📡 Connected to Ollama at: ${OLLAMA_BASE_URL}`);
  console.log(`🤖 Default model: ${OLLAMA_MODEL}`);
  console.log(`🧭 Router model:  ${OLLAMA_ROUTER_MODEL}`);
  console.log(`🧠 Analyzer model: ${OLLAMA_ANALYZER_MODEL}`);
  console.log(`🏪 Backend API: ${registry.baseUrl}`);
  console.log(`📋 Registered APIs: ${registry.apis.length} endpoints`);
  console.log(`\n💡 To change models: set OLLAMA_ROUTER_MODEL / OLLAMA_ANALYZER_MODEL env variables`);
  console.log(`   Example: OLLAMA_ROUTER_MODEL=qwen2.5-coder:3b OLLAMA_ANALYZER_MODEL=qwen3 node server.js\n`);
});
