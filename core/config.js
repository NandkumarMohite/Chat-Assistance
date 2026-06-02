// ─────────────────────────────────────────────
// core/config.js — Environment & app-level constants
// ─────────────────────────────────────────────

require('dotenv').config();

module.exports = {
  OLLAMA_BASE_URL: process.env.OLLAMA_URL   || 'http://localhost:11434',
  OLLAMA_MODEL:    process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b',
  // Dual-model defaults: routing (fast/small) vs analysis (smart/large)
  OLLAMA_ROUTER_MODEL:   process.env.OLLAMA_ROUTER_MODEL   || process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b',
  OLLAMA_ANALYZER_MODEL: process.env.OLLAMA_ANALYZER_MODEL || process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b',
  BACKEND_URL:     process.env.BACKEND_URL  || 'http://localhost:8080/api/v1',
  PORT:            process.env.PORT         || 3000,
  TEST_LOCALLY:    process.env.TEST_LOCALLY === 'true',
  // Default timezone for date parsing (e.g., 'Asia/Kolkata' for IST, 'America/New_York' for EST)
  // If not set, uses the client's browser timezone or falls back to UTC
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || null,
};
