// ─────────────────────────────────────────────
// core/config.js — Environment & app-level constants
// ─────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
require('dotenv').config();

function resolvePlaceholders(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\${([^}]+)}/g, (match, key) => process.env[key] || match);
}

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
  
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || yamlConfig.ollama?.model || 'qwen2.5-coder:3b',
  
  // Eureka specific settings (Spring-style schema)
  EUREKA_ENABLED: process.env.EUREKA_ENABLED === 'true' || yamlConfig.eureka?.client?.registerWithEureka || false,
  EUREKA_DEFAULT_ZONE: resolvePlaceholders(process.env.EUREKA_DEFAULT_ZONE || yamlConfig.eureka?.client?.serviceUrl?.defaultZone || 'http://localhost:8761/eureka/'),
  
  // Discovery and fallback URLs
  OLLAMA_BASE_URL: process.env.OLLAMA_URL || resolvePlaceholders(yamlConfig.eureka?.discovery?.client?.simple?.instances?.ollamaF?.[0]?.uri) || 'http://localhost:11434',
  BACKEND_BASE_URL: process.env.BACKEND_URL || resolvePlaceholders(yamlConfig.eureka?.discovery?.client?.simple?.instances?.BACKEND_BFF?.[0]?.uri) || 'http://localhost:8080',
  
  LOG_LEVEL: process.env.LOG_LEVEL || yamlConfig.logging?.level || 'info'
};
