const Eureka = require('eureka-js-client').Eureka;
const { 
  PORT, 
  EUREKA_ENABLED, 
  EUREKA_DEFAULT_ZONE,
  NODE_ENV
} = require('./config');

let client = null;

if (EUREKA_ENABLED) {
  // Parse EUREKA_DEFAULT_ZONE (http://user:pass@host:port/eureka/)
  // Note: Simple URL parsing. In production, consider using a robust URL library if needed.
  let host = 'localhost';
  let port = 8761;
  let servicePath = '/eureka/v2/apps/';

  try {
    const url = new URL(EUREKA_DEFAULT_ZONE);
    host = url.hostname;
    port = url.port || (url.protocol === 'https:' ? 443 : 80);
    servicePath = url.pathname;
    
    // eureka-js-client expects servicePath to NOT end with / if it's just the prefix
    // but the URL might include /eureka/v2/apps/
    if (!servicePath.endsWith('/')) servicePath += '/';
  } catch (e) {
    console.warn('⚠️ Could not parse EUREKA_DEFAULT_ZONE, using defaults.');
  }

  client = new Eureka({
    instance: {
      app: 'ollama-chat-ai',
      hostName: process.env.POD_NAME || process.env.HOSTNAME || 'localhost',
      ipAddr: process.env.POD_IP || '127.0.0.1',
      statusPageUrl: `http://${process.env.POD_NAME || 'localhost'}:${PORT}/api/health`,
      port: {
        '$': PORT,
        '@enabled': 'true',
      },
      vipAddress: 'ollama-chat-ai',
      dataCenterInfo: {
        '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
        name: 'MyOwn',
      },
    },
    eureka: {
      host: host,
      port: port,
      servicePath: servicePath,
    },
  });
}

function startEureka() {
  if (!EUREKA_ENABLED) return;
  
  client.start((error) => {
    if (error) {
      console.error('❌ Eureka registration failed:', error);
    } else {
      console.log('✅ Registered with Eureka');
    }
  });
}

function getServiceUrl(appName) {
  if (!EUREKA_ENABLED) return null;
  
  const instances = client.getInstancesByAppId(appName);
  if (instances && instances.length > 0) {
    const instance = instances[0];
    return `http://${instance.hostName}:${instance.port.$}`;
  }
  return null;
}

module.exports = { startEureka, getServiceUrl };
