const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b';

// ─────────────────────────────────────────────
// LOAD API REGISTRY (developer-editable file)
// ─────────────────────────────────────────────
let API_REGISTRY;
try {
  const raw = fs.readFileSync(path.join(__dirname, 'api-registry.json'), 'utf-8');
  API_REGISTRY = JSON.parse(raw);
  console.log(`✅ Loaded API registry: ${API_REGISTRY.apis.length} endpoints from ${API_REGISTRY.serviceName}`);
} catch (err) {
  console.error('❌ Failed to load api-registry.json:', err.message);
  process.exit(1);
}

// ─────────────────────────────────────────────
// BUILD API DESCRIPTION FOR OLLAMA CONTEXT
// ─────────────────────────────────────────────
function buildAPIDescription() {
  let desc = `You have access to a REST API service called "${API_REGISTRY.serviceName}".\n`;
  desc += `${API_REGISTRY.description}\n`;
  desc += `Base URL: ${API_REGISTRY.baseUrl}\n\n`;
  desc += `Available API endpoints:\n\n`;

  for (const api of API_REGISTRY.apis) {
    desc += `─── ${api.id} ───\n`;
    desc += `  Name: ${api.name}\n`;
    desc += `  Description: ${api.description}\n`;
    desc += `  Method: ${api.method}\n`;
    desc += `  Path: ${api.path}\n`;

    if (api.parameters && api.parameters.length > 0) {
      desc += `  Path Parameters:\n`;
      for (const p of api.parameters) {
        desc += `    - ${p.name} (${p.type}, ${p.required ? 'required' : 'optional'}): ${p.description}\n`;
      }
    }

    if (api.requestBody) {
      desc += `  Request Body (${api.requestBody.type}):\n`;
      for (const f of api.requestBody.fields) {
        desc += `    - ${f.name} (${f.type}${f.required ? ', required' : ''}): ${f.description}\n`;
      }
    }

    if (api.keywords) {
      desc += `  Trigger keywords: ${api.keywords.join(', ')}\n`;
    }

    desc += `\n`;
  }

  // Include dependency chain descriptions so the LLM knows they exist
  if (API_REGISTRY.dependencyChains && API_REGISTRY.dependencyChains.length > 0) {
    desc += `\n── DEPENDENCY CHAINS (multi-step workflows) ──\n`;
    desc += `Use these when the user identifies an entity by a non-ID field (e.g. phone, email, name).\n\n`;
    for (const chain of API_REGISTRY.dependencyChains) {
      desc += `  Chain: ${chain.id}\n`;
      desc += `  Use when: ${chain.triggerCondition}\n`;
      desc += `  Steps: ${chain.steps.map((s, i) => `${i + 1}) ${s.apiId}${s.filterBy ? ` (filter by ${s.filterBy})` : ''}`).join(' → ')}\n\n`;
    }
  }

  return desc;
}

const API_DESCRIPTION = buildAPIDescription();

// ─────────────────────────────────────────────
// HELPER: Resolve a dependency chain
// ─────────────────────────────────────────────
async function executeDependencyChain(chain, userMessage, jwtToken, send) {
  const context = {}; // stores extracted values like resolvedUserId
  const allResults = [];

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i];
    const apiDef = API_REGISTRY.apis.find(a => a.id === step.apiId);
    if (!apiDef) throw new Error(`Chain step references unknown API: ${step.apiId}`);

    // Resolve path params — replace $varName references with context values
    let resolvedPathParams = {};
    if (step.pathParams) {
      for (const [key, val] of Object.entries(step.pathParams)) {
        resolvedPathParams[key] = typeof val === 'string' && val.startsWith('$')
          ? context[val.slice(1)]
          : val;
      }
    }

    // Build URL
    let urlPath = apiDef.path;
    for (const [key, val] of Object.entries(resolvedPathParams)) {
      urlPath = urlPath.replace(`{${key}}`, encodeURIComponent(val));
    }
    const fullUrl = `${API_REGISTRY.baseUrl}${urlPath}`;

    send('api_call', { method: apiDef.method, url: fullUrl, body: null, name: apiDef.name });
    send('status', { step: `chain_${i}`, message: `🔗 Step ${i + 1}/${chain.steps.length}: Calling ${apiDef.name}...` });

    const result = await executeAPICall({ method: apiDef.method, url: fullUrl, body: null }, jwtToken);
    const resultArray = Array.isArray(result) ? result : [result];

    // If this step has a filter + extract, find the matching record and save the field
    if (step.filterBy && step.extractField && step.saveAs) {
      // Extract the filter value from user message (fuzzy match any token)
      const userTokens = userMessage.toLowerCase().split(/\s+/);
      const matched = resultArray.find(record => {
        const fieldVal = String(record[step.filterBy] || '').toLowerCase();
        return userTokens.some(token => token.length > 2 && fieldVal.includes(token));
      });

      if (!matched) {
        throw new Error(`Could not find a record where ${step.filterBy} matches the value in your message.`);
      }

      context[step.saveAs] = matched[step.extractField];
      console.log(`[CHAIN] Resolved ${step.saveAs} = ${context[step.saveAs]} (matched ${step.filterBy}: ${matched[step.filterBy]})`);

      // Send intermediate filtered result as data
      send('data', { rows: [matched], count: 1, apiName: `${apiDef.name} (matched ${step.filterBy})` });
    } else {
      // Regular step — just show data
      send('data', { rows: resultArray, count: resultArray.length, apiName: apiDef.name });
    }

    allResults.push({ apiId: step.apiId, name: apiDef.name, data: result });
  }

  return allResults;
}

// ─────────────────────────────────────────────
// HELPER: Call Ollama (non-streaming)
// ─────────────────────────────────────────────
async function callOllama(systemPrompt, userMessage, enableThink = false) {
  const body = {
    model: OLLAMA_MODEL,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  };

  // Only add think param if the model supports it (e.g. deepseek-r1, qwen3)
  if (enableThink) {
    body.think = true;
  }

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return {
    thinking: data.message?.thinking || '',
    content: data.message?.content || ''
  };
}

// ─────────────────────────────────────────────
// HELPER: Execute API call to ShamStore backend
// ─────────────────────────────────────────────
async function executeAPICall(apiPlan, jwtToken) {
  const { method, url, body } = apiPlan;

  const fetchOptions = {
    method: method.toUpperCase(),
    headers: { 'Content-Type': 'application/json' }
  };

  if (jwtToken) {
    fetchOptions.headers['Authorization'] = `Bearer ${jwtToken}`;
    console.log(`[EXECUTE API] Calling ${url} with Auth Header`);
  } else {
    console.log(`[EXECUTE API] Calling ${url} WITHOUT Auth Header`);
  }

  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('UNAUTHORIZED_OR_FORBIDDEN');
    }
    const errorText = await response.text();
    throw new Error(`API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data;
}

// ─────────────────────────────────────────────
// HELPER: Extract JSON from Ollama response
// ─────────────────────────────────────────────
function extractJSON(text) {
  // Try ```json ... ``` block first
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlockMatch) {
    try { return JSON.parse(jsonBlockMatch[1].trim()); } catch { }
  }

  // Try ``` ... ``` block
  const codeBlockMatch = text.match(/```\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch { }
  }

  // Try to find JSON object directly
  const jsonObjMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjMatch) {
    try { return JSON.parse(jsonObjMatch[0].trim()); } catch { }
  }

  return null;
}

// ─────────────────────────────────────────────
// STREAMING CHAT ENDPOINT
// ─────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, conversationHistory = [], jwtToken } = req.body;
  console.log(`[CHAT REQUEST] Message: "${message}"`);
  console.log(`[CHAT REQUEST] JWT Token from frontend:`, jwtToken ? jwtToken.substring(0, 20) + '...' : 'NULL or UNDEFINED');

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // ── STEP 1: Classify intent & pick API ──────
    send('status', { step: 'classify', message: '🧠 Understanding your question...' });

    const chainDescriptions = (API_REGISTRY.dependencyChains || []).map(c =>
      `  - ${c.id}: ${c.triggerCondition}`
    ).join('\n');

    const classifyPrompt = `You are an intelligent API routing assistant. Determine if the user's question requires calling an API or can be answered from general knowledge.

${API_DESCRIPTION}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "requiresAPI": true|false,
  "reason": "brief explanation",
  "chainId": "dependency chain id to use, or null",
  "apiId": "the api id from the registry to call, or null",
  "pathParams": { "paramName": "value" },
  "requestBody": { ... } or null,
  "clientFilter": { "field": "fieldName", "value": "filterValue" } or null,
  "multipleAPIs": false,
  "apiCalls": []
}

RULES:
- If the question needs data from the backend, set requiresAPI to true and pick the correct API.
- If the user identifies an entity by phone, email, or name (not by ID), and a DEPENDENCY CHAIN exists for it, set chainId to that chain's id instead of apiId.
- Available dependency chains:\n${chainDescriptions}
- Fill in pathParams if the API path has {placeholders} — extract values from the user message.
- Fill in requestBody for POST/PUT methods with the data the user provided.
- CLIENT-SIDE FILTER FALLBACK: If the user wants to filter results by a field (e.g. role, category, status, name) but no API directly supports that filter as a parameter, call the closest "get all" API (e.g. get_all_users, get_all_products) and set clientFilter with the field name and filter value. The server will filter the results for you.
  Example: user asks "show me all users with role OWNER" → apiId: get_all_users, clientFilter: { field: "role", value: "OWNER" }
  Example: user asks "show products with stock more than 0" → apiId: get_all_products, clientFilter: { field: "stock", value: "0", operator: "gt" }
- If you need to call multiple APIs, set multipleAPIs to true and list them in apiCalls array.
- If the user's question is general knowledge (e.g. "what is Java?"), set requiresAPI to false.
- apiId must exactly match one of the API ids listed above.

Do NOT include any other text, markdown, or explanation outside the JSON.`;

    const classifyResult = await callOllama(classifyPrompt, message, false);
    let requiresAPI = false;
    let apiPlan = null;

    try {
      const parsed = extractJSON(classifyResult.content);
      if (parsed) {
        requiresAPI = parsed.requiresAPI === true;
        apiPlan = parsed;
      }
    } catch {
      // If classification fails, check keywords
      const allKeywords = API_REGISTRY.apis.flatMap(a => a.keywords || []);
      requiresAPI = allKeywords.some(k => message.toLowerCase().includes(k.toLowerCase()));
    }

    let apiResults = [];
    let apiCallsMade = [];
    let thinkingLog = '';

    if (requiresAPI && apiPlan) {
      // ── STEP 2: Check for dependency chain first ─
      send('status', { step: 'plan_api', message: '⚙️ Planning API calls...' });

      if (apiPlan.chainId) {
        const chain = (API_REGISTRY.dependencyChains || []).find(c => c.id === apiPlan.chainId);
        if (chain) {
          send('status', { step: 'chain_start', message: `🔗 Running dependency chain: ${chain.id}...` });
          try {
            const chainResults = await executeDependencyChain(chain, message, jwtToken, send);
            apiResults = chainResults;
            apiCallsMade = chainResults;
          } catch (chainErr) {
            send('error_partial', { message: `Chain error: ${chainErr.message}` });
            apiResults.push({ error: chainErr.message });
          }
          // Skip normal API execution — chain handled it
          goto_interpret: {
            // nothing — fall through to interpret step
          }
        }
      }

      const callsToMake = !apiPlan.chainId && apiPlan.multipleAPIs && apiPlan.apiCalls?.length
        ? apiPlan.apiCalls
        : !apiPlan.chainId
          ? [{ apiId: apiPlan.apiId, pathParams: apiPlan.pathParams, requestBody: apiPlan.requestBody }]
          : [];

      for (const call of callsToMake) {
        const apiDef = API_REGISTRY.apis.find(a => a.id === call.apiId);
        if (!apiDef) {
          send('error_partial', { message: `Unknown API: ${call.apiId}` });
          continue;
        }

        // Build the full URL
        let urlPath = apiDef.path;
        if (call.pathParams) {
          for (const [key, val] of Object.entries(call.pathParams)) {
            urlPath = urlPath.replace(`{${key}}`, encodeURIComponent(val));
          }
        }
        const fullUrl = `${API_REGISTRY.baseUrl}${urlPath}`;

        const apiCallInfo = {
          apiId: call.apiId,
          name: apiDef.name,
          method: apiDef.method,
          url: fullUrl,
          body: call.requestBody || null
        };

        // Show the API call being made
        send('api_call', {
          method: apiDef.method,
          url: fullUrl,
          body: call.requestBody || null,
          name: apiDef.name
        });

        // ── STEP 3: Execute API call ────────────────
        send('status', { step: 'execute', message: `🔍 Calling ${apiDef.name}...` });

        try {
          const result = await executeAPICall(apiCallInfo, jwtToken);

          if (result && result.token) {
            send('auth_token', { token: result.token });
          }

          let resultArray = Array.isArray(result) ? result : [result];

          // ── CLIENT-SIDE FILTER FALLBACK ──────────────
          // If the LLM requested a clientFilter, apply it now
          if (call.clientFilter || apiPlan.clientFilter) {
            const cf = call.clientFilter || apiPlan.clientFilter;
            const field = cf.field;
            const filterVal = String(cf.value || '').toLowerCase();
            const operator = cf.operator || 'eq'; // eq, contains, gt, lt, gte, lte

            const before = resultArray.length;
            resultArray = resultArray.filter(record => {
              const recVal = record[field];
              if (recVal === undefined || recVal === null) return false;
              const recStr = String(recVal).toLowerCase();
              switch (operator) {
                case 'contains': return recStr.includes(filterVal);
                case 'gt': return parseFloat(recVal) > parseFloat(cf.value);
                case 'lt': return parseFloat(recVal) < parseFloat(cf.value);
                case 'gte': return parseFloat(recVal) >= parseFloat(cf.value);
                case 'lte': return parseFloat(recVal) <= parseFloat(cf.value);
                default: return recStr === filterVal; // eq
              }
            });

            console.log(`[CLIENT FILTER] ${field} ${operator} "${cf.value}": ${before} → ${resultArray.length} records`);
            send('status', { step: 'filter', message: `🔎 Filtered by ${field}="${cf.value}": ${resultArray.length} match(es)` });
          }

          apiResults.push({ apiId: call.apiId, name: apiDef.name, data: resultArray });
          apiCallsMade.push(apiCallInfo);

          send('data', {
            rows: resultArray,
            count: resultArray.length,
            apiName: apiDef.name
          });
        } catch (apiErr) {
          if (apiErr.message === 'UNAUTHORIZED_OR_FORBIDDEN') {
            send('error_partial', {
              message: `🔒 Authentication Required for ${apiDef.name}. Please sign in.`,
              api: fullUrl
            });
            apiResults.push({ apiId: call.apiId, name: apiDef.name, error: "Requires authentication. Tell the user to sign in with their email and password." });
          } else {
            send('error_partial', {
              message: `API Error (${apiDef.name}): ${apiErr.message}`,
              api: fullUrl
            });
            apiResults.push({ apiId: call.apiId, name: apiDef.name, error: apiErr.message });
          }
        }
      }
    }

    // ── STEP 4: Generate human-readable response ──
    send('status', { step: 'interpret', message: '💬 Crafting your answer...' });

    const interpretPrompt = requiresAPI
      ? `You are a friendly and insightful assistant for the ShamStore application.

The user asked: "${message}"

I called the following API(s) and got these results:
${JSON.stringify(apiResults, null, 2)}

Instructions:
- Write a clear, friendly, human-readable answer based on the API data
- Use bullet points, tables (markdown), or numbered lists where helpful
- Highlight key insights and numbers
- If the result has multiple items, summarize patterns and standout values
- Be conversational but precise
- Do NOT mention raw JSON, API endpoints, or technical implementation details
- If there was an error, apologize and explain what happened simply
- Format currencies and numbers nicely`
      : `You are a helpful AI assistant for the ShamStore application. Answer the user's question in a friendly, concise, and informative way.

User asked: "${message}"

${conversationHistory.length > 0 ? `Conversation context: ${JSON.stringify(conversationHistory.slice(-4))}` : ''}

Provide a well-structured, markdown-formatted answer.`;

    const interpretResult = await callOllama(interpretPrompt, '', false);

    if (interpretResult.thinking) {
      thinkingLog = interpretResult.thinking;
      send('thinking', { content: thinkingLog });
    }

    send('answer', { content: interpretResult.content });
    send('done', {
      requiresAPI,
      apisCalled: apiCallsMade.map(a => ({ method: a.method, url: a.url, name: a.name })),
      totalResults: apiResults.reduce((sum, r) => {
        const d = r.data;
        return sum + (Array.isArray(d) ? d.length : d ? 1 : 0);
      }, 0)
    });

  } catch (err) {
    console.error('Chat error:', err);
    send('error', { message: err.message || 'An unexpected error occurred.' });
  } finally {
    res.end();
  }
});

// ─────────────────────────────────────────────
// GET API REGISTRY (for frontend display)
// ─────────────────────────────────────────────
app.get('/api/registry', (req, res) => {
  res.json({
    serviceName: API_REGISTRY.serviceName,
    baseUrl: API_REGISTRY.baseUrl,
    apis: API_REGISTRY.apis.map(a => ({
      id: a.id,
      name: a.name,
      method: a.method,
      path: a.path,
      description: a.description
    }))
  });
});

// ─────────────────────────────────────────────
// RELOAD API REGISTRY (hot-reload without restart)
// ─────────────────────────────────────────────
app.post('/api/registry/reload', (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'api-registry.json'), 'utf-8');
    API_REGISTRY = JSON.parse(raw);
    console.log(`🔄 API registry reloaded: ${API_REGISTRY.apis.length} endpoints`);
    res.json({ message: 'Registry reloaded', count: API_REGISTRY.apis.length });
  } catch (err) {
    res.status(500).json({ error: `Failed to reload: ${err.message}` });
  }
});

// ─────────────────────────────────────────────
// LIST AVAILABLE OLLAMA MODELS
// ─────────────────────────────────────────────
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await response.json();
    res.json({ models: data.models || [] });
  } catch (err) {
    res.status(500).json({ error: 'Cannot connect to Ollama. Make sure Ollama is running.' });
  }
});

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  let ollamaStatus = 'disconnected';
  let availableModels = [];

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await response.json();
    ollamaStatus = 'connected';
    availableModels = (data.models || []).map(m => m.name);
  } catch { }

  let backendStatus = 'disconnected';
  try {
    const response = await fetch(`${API_REGISTRY.baseUrl}/api/users`, { method: 'GET', timeout: 3000 });
    if (response.ok) backendStatus = 'connected';
  } catch { }

  res.json({
    status: 'ok',
    ollama: ollamaStatus,
    backend: backendStatus,
    backendUrl: API_REGISTRY.baseUrl,
    model: OLLAMA_MODEL,
    registeredAPIs: API_REGISTRY.apis.length,
    availableModels
  });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Ollama Chat AI Server running at http://localhost:${PORT}`);
  console.log(`📡 Connected to Ollama at: ${OLLAMA_BASE_URL}`);
  console.log(`🤖 Using model: ${OLLAMA_MODEL}`);
  console.log(`🏪 Backend API: ${API_REGISTRY.baseUrl}`);
  console.log(`📋 Registered APIs: ${API_REGISTRY.apis.length} endpoints`);
  console.log(`\n💡 To change model: set OLLAMA_MODEL env variable`);
  console.log(`   Example: OLLAMA_MODEL=qwen3 node server.js\n`);
});
