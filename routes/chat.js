// ─────────────────────────────────────────────
// routes/chat.js — POST /api/chat  (SSE streaming handler)
// ─────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getRegistry, buildAPIDescription } = require('../core/registry');
const { callOllama, extractJSON } = require('../core/ollama');
const { executeAPICall, applyClientFilter, executeDependencyChain } = require('../core/executor');
const { buildClassifyPrompt, buildInterpretPrompt, buildGeneralPrompt } = require('../core/prompts');

// TODO: If you want to add a New API (like getting sellers, workers, etc.), 
// DO NOT ADD CODE HERE. The AI automatically routes requests based on `api-registry.json`.
// Just add your new API config into `api-registry.json` and the AI will handle the rest!

router.post('/', async (req, res) => {
  const { message, conversationHistory = [], jwtToken } = req.body;
  console.log(`[CHAT REQUEST] Message: "${message}"`);
  console.log(`[CHAT REQUEST] JWT Token from frontend:`, jwtToken ? jwtToken.substring(0, 20) + '...' : 'NULL or UNDEFINED');

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // ── Set up SSE ────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const registry = getRegistry();

    // ── STEP 1: Classify intent & pick API / chain ──
    send('status', { step: 'classify', message: '🧠 Understanding your question...' });

    const chainDescriptions = (registry.dependencyChains || [])
      .map(c => `  - ${c.id}: ${c.triggerCondition}`)
      .join('\n');

    const classifyResult = await callOllama(
      buildClassifyPrompt(buildAPIDescription(), chainDescriptions),
      message,
      false
    );

    let requiresAPI = false;
    let apiPlan = null;

    try {
      const parsed = extractJSON(classifyResult.content);
      if (parsed) {
        requiresAPI = parsed.requiresAPI === true;
        apiPlan = parsed;
      }
    } catch {
      // Fallback: keyword match
      const allKeywords = registry.apis.flatMap(a => a.keywords || []);
      requiresAPI = allKeywords.some(k => message.toLowerCase().includes(k.toLowerCase()));
    }

    let apiResults = [];
    let apiCallsMade = [];

    if (requiresAPI && apiPlan) {
      // ── STEP 2: Plan & execute ─────────────────────
      send('status', { step: 'plan_api', message: '⚙️ Planning API calls...' });

      // ── Dependency chain path ─────────────────────
      if (apiPlan.chainId) {
        const chain = (registry.dependencyChains || []).find(c => c.id === apiPlan.chainId);
        if (chain) {
          send('status', { step: 'chain_start', message: `🔗 Running dependency chain: ${chain.id}...` });
          try {
            apiResults = await executeDependencyChain(chain, message, jwtToken, send);
            apiCallsMade = apiResults;
          } catch (chainErr) {
            send('error_partial', { message: `Chain error: ${chainErr.message}` });
            apiResults.push({ error: chainErr.message });
          }
        }
      }

      // ── Direct API call(s) path ───────────────────
      const callsToMake = !apiPlan.chainId && apiPlan.multipleAPIs && apiPlan.apiCalls?.length
        ? apiPlan.apiCalls
        : !apiPlan.chainId
          ? [{ apiId: apiPlan.apiId, pathParams: apiPlan.pathParams, requestBody: apiPlan.requestBody, clientFilter: apiPlan.clientFilter }]
          : [];

      for (const call of callsToMake) {
        const apiDef = registry.apis.find(a => a.id === call.apiId);
        if (!apiDef) {
          send('error_partial', { message: `Unknown API: ${call.apiId}` });
          continue;
        }

        // Build the full URL with path params
        let urlPath = apiDef.path;
        if (call.pathParams) {
          for (const [key, val] of Object.entries(call.pathParams)) {
            urlPath = urlPath.replace(`{${key}}`, encodeURIComponent(val));
          }
        }
        const fullUrl = `${registry.baseUrl}${urlPath}`;

        const apiCallInfo = { apiId: call.apiId, name: apiDef.name, method: apiDef.method, url: fullUrl, body: call.requestBody || null };

        send('api_call', { method: apiDef.method, url: fullUrl, body: call.requestBody || null, name: apiDef.name });
        send('status', { step: 'execute', message: `🔍 Calling ${apiDef.name}...` });

        try {
          const result = await executeAPICall(apiCallInfo, jwtToken);

          // Auth token from login/register responses
          if (result && result.token) {
            send('auth_token', { token: result.token });
          }

          let resultArray = Array.isArray(result) ? result : [result];

          // Apply client-side filter if requested
          if (call.clientFilter) {
            resultArray = applyClientFilter(resultArray, call.clientFilter, send);
          }

          apiResults.push({ apiId: call.apiId, name: apiDef.name, data: resultArray });
          apiCallsMade.push(apiCallInfo);

          send('data', { rows: resultArray, count: resultArray.length, apiName: apiDef.name });

        } catch (apiErr) {
          if (apiErr.message === 'UNAUTHORIZED_OR_FORBIDDEN') {
            send('error_partial', {
              message: `🔒 Authentication Required for ${apiDef.name}. Please sign in.`,
              api: fullUrl,
            });
            apiResults.push({ apiId: call.apiId, name: apiDef.name, error: 'Requires authentication. Tell the user to sign in with their email and password.' });
          } else {
            send('error_partial', { message: `API Error (${apiDef.name}): ${apiErr.message}`, api: fullUrl });
            apiResults.push({ apiId: call.apiId, name: apiDef.name, error: apiErr.message });
          }
        }
      }
    }

    // ── STEP 3: Generate human-readable response ──
    send('status', { step: 'interpret', message: '💬 Crafting your answer...' });

    const interpretPrompt = requiresAPI
      ? buildInterpretPrompt(message, apiResults)
      : buildGeneralPrompt(message, conversationHistory);

    const interpretResult = await callOllama(interpretPrompt, '', false);

    if (interpretResult.thinking) {
      send('thinking', { content: interpretResult.thinking });
    }

    send('answer', { content: interpretResult.content });
    send('done', {
      requiresAPI,
      apisCalled: apiCallsMade.map(a => ({ method: a.method, url: a.url, name: a.name })),
      totalResults: apiResults.reduce((sum, r) => {
        const d = r.data;
        return sum + (Array.isArray(d) ? d.length : d ? 1 : 0);
      }, 0),
    });

  } catch (err) {
    console.error('Chat error:', err);
    send('error', { message: err.message || 'An unexpected error occurred.' });
  } finally {
    res.end();
  }
});

module.exports = router;
