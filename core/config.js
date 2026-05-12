// ─────────────────────────────────────────────
// core/config.js — Environment & app-level constants
// ─────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const envMapping = {
  'production': 'prod',
  'development': 'dev',
  'prod': 'prod',
  'dev': 'dev'
};
const profile = envMapping[nodeEnv] || 'dev';

// Priority: CONFIG_PATH env > Profile-based path
const configPath = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config', `application-${profile}.yml`);

let yamlConfig = {};
try {
  if (fs.existsSync(configPath)) {
    yamlConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));
    console.log(`✅ Loaded configuration from ${configPath}`);
  }
} catch (e) {
  console.error(`⚠️ Failed to load YAML config: ${e.message}`);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || yamlConfig.server?.node_env || 'development',
  PORT: process.env.PORT || yamlConfig.server?.port || 3000,
  OLLAMA_BASE_URL: process.env.OLLAMA_URL || yamlConfig.ollama?.base_url || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || yamlConfig.ollama?.model || 'qwen2.5-coder:3b',
  BACKEND_BASE_URL: process.env.BACKEND_URL || yamlConfig.backend?.base_url || 'http://localhost:8080',
  EUREKA_ENABLED: process.env.EUREKA_ENABLED === 'true' || yamlConfig.eureka?.enabled || false,
  EUREKA_HOST: process.env.EUREKA_HOST || yamlConfig.eureka?.host || 'localhost',
  EUREKA_PORT: process.env.EUREKA_PORT || yamlConfig.eureka?.port || 8761,
  EUREKA_SERVICE_URL: process.env.EUREKA_SERVICE_URL || yamlConfig.eureka?.service_url || '/eureka/v2/apps/',
  EUREKA_BACKEND_NAME: process.env.EUREKA_BACKEND_NAME || yamlConfig.eureka?.backend_name || 'COMAU-BACKEND',
  LOG_LEVEL: process.env.LOG_LEVEL || yamlConfig.logging?.level || 'info'
};
