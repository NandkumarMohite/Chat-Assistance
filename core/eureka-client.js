const Eureka = require('eureka-js-client').Eureka;
const { 
  PORT, 
  EUREKA_ENABLED, 
  EUREKA_HOST, 
  EUREKA_PORT, 
  EUREKA_SERVICE_URL,
  NODE_ENV
} = require('./config');

let client = null;

if (EUREKA_ENABLED) {
  client = new Eureka({
    instance: {
      app: 'ollama-chat-ai',
      hostName: process.env.HOSTNAME || 'localhost',
      ipAddr: '127.0.0.1',
      statusPageUrl: `http://localhost:${PORT}/api/health`,
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
      host: EUREKA_HOST,
      port: EUREKA_PORT,
      servicePath: EUREKA_SERVICE_URL,
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
