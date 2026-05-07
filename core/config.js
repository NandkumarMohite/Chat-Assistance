// ─────────────────────────────────────────────
// core/config.js — Environment & app-level constants
// ─────────────────────────────────────────────

module.exports = {
  OLLAMA_BASE_URL: process.env.OLLAMA_URL   || 'http://localhost:11434',
  OLLAMA_MODEL:    process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b',
  PORT:            process.env.PORT         || 3000,
};
