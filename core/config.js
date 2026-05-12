// ─────────────────────────────────────────────
// core/config.js — Environment & app-level constants
// ─────────────────────────────────────────────

require('dotenv').config();

module.exports = {
  OLLAMA_BASE_URL: process.env.OLLAMA_URL   || 'http://localhost:11434',
  OLLAMA_MODEL:    process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b',
  BACKEND_URL:     process.env.BACKEND_URL  || 'http://localhost:8080/api/v1',
  PORT:            process.env.PORT         || 3000,
};
