// ─────────────────────────────────────────────
// routes/chat.js — POST /api/chat  (SSE streaming handler)
// ─────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getRegistry, buildAPIDescription } = require('../core/registry');
const { callOllama, extractJSON } = require('../core/ollama');
const { executeAPICall, applyClientFilter, executeDependencyChain } = require('../core/executor');
const { buildClassifyPrompt, buildInterpretPrompt, buildGeneralPrompt } = require('../core/prompts');
const { resolveTemporalQueryParams } = require('../core/dateRange');
const { getMockResponse } = require('../core/test-mock-data');
const { TEST_LOCALLY } = require('../core/config');
const { 
  expandSynonyms, 
  normalizeQueryParams, 
  validateRouting, 
  handleLowConfidence,
  preprocessMessage,
  logRoutingDecision 
} = require('../core/routingUtils');

function buildApiUrl(baseUrl, apiPath, pathParams = {}, queryParams = {}) {
  let urlPath = apiPath;
  const usedPathKeys = new Set();

  // Replace path placeholders like /lines/{lineId}
  for (const [key, val] of Object.entries(pathParams || {})) {
    const placeholder = `{${key}}`;
    if (urlPath.includes(placeholder)) {
      urlPath = urlPath.replace(placeholder, encodeURIComponent(val));
      usedPathKeys.add(key);
    }
  }

  // Backward compatibility: any pathParams key not used in path becomes query param
  const mergedQuery = { ...(queryParams || {}) };
  for (const [key, val] of Object.entries(pathParams || {})) {
    if (!usedPathKeys.has(key) && mergedQuery[key] === undefined) {
      mergedQuery[key] = val;
    }
  }

  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(mergedQuery)) {
    if (val === undefined || val === null || val === '') continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item !== undefined && item !== null && item !== '') {
          searchParams.append(key, String(item));
        }
      }
    } else {
      searchParams.append(key, String(val));
    }
  }

  const qs = searchParams.toString();
  return `${baseUrl}${urlPath}${qs ? `?${qs}` : ''}`;
}

// TODO: If you want to add a New API (like getting sellers, workers, etc.), 
// DO NOT ADD CODE HERE. The AI automatically routes requests based on `api-registry.json`.
// Just add your new API config into `api-registry.json` and the AI will handle the rest!

router.post('/', async (req, res) => {
  const { message, conversationHistory = [], jwtToken, clientTimeZone, routerModel, analyzerModel } = req.body;
  const timeZone = clientTimeZone || 'UTC';
  console.log(`[CHAT REQUEST] Message: "${message}"`);
  console.log(`[CHAT REQUEST] JWT Token from frontend:`, jwtToken ? jwtToken.substring(0, 20) + '...' : 'NULL or UNDEFINED');
  console.log(`[CHAT REQUEST] Client Timezone: ${timeZone}`);

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

    // ── STEP 0: Pre-process message with synonyms ──
    const routingConfig = {
      synonyms: registry.synonyms || {},
      intentCategories: registry.intentCategories || {},
      dateParamAliases: registry.dateParamAliases || {}
    };
    const { expandedMessage, extractedEntities } = preprocessMessage(message, registry);
    console.log(`[ROUTING] Extracted entities:`, extractedEntities);

    // ── STEP 1: Classify intent & pick API / chain ──
    send('status', { step: 'classify', message: '🧠 Understanding your question...' });

    const chainDescriptions = (registry.dependencyChains || [])
      .map(c => `  - ${c.id}: ${c.triggerCondition}`)
      .join('\n');

    const classifyResult = await callOllama(
      buildClassifyPrompt(buildAPIDescription(), chainDescriptions, routingConfig),
      expandedMessage,
      false,
      routerModel || null
    );
    console.log(`[ROUTING] Using router model: ${routerModel || 'default'}`);

    let requiresAPI = false;
    let apiPlan = null;

    try {
      const parsed = extractJSON(classifyResult.content);
      if (parsed) {
        requiresAPI = parsed.requiresAPI === true;
        apiPlan = parsed;
        
        // Log the routing decision
        console.log(`[ROUTING] Confidence: ${((apiPlan.confidence ?? 1) * 100).toFixed(0)}%`);
        console.log(`[ROUTING] Intent Category: ${apiPlan.intentCategory || 'unknown'}`);
        console.log(`[ROUTING] API: ${apiPlan.apiId || apiPlan.chainId || 'none'}`);
        if (apiPlan.calls && apiPlan.calls.length > 0) {
          console.log(`[ROUTING] Query Params from LLM:`, JSON.stringify(apiPlan.calls[0].queryParams, null, 2));
        }
      }
    } catch (err) {
      // If the router didn't return clean JSON, log raw output and perform a keyword/category scoring fallback
      console.log('[ROUTER] Failed to parse classifier JSON:', err?.message || 'parse error');
      console.log('[ROUTER] Raw classifier output:', classifyResult.content);

      // Score APIs by category/keyword heuristics as a fallback
      const scored = [];
      for (const cat of Object.keys(registry.intentCategories || {})) {
        const matches = findAPIsByCategory(cat, message, registry);
        if (matches && matches.length > 0) scored.push(...matches);
      }

      if (scored.length > 0) {
        scored.sort((a, b) => b.score - a.score);
        const top = scored[0];
        requiresAPI = true;
        apiPlan = {
          requiresAPI: true,
          confidence: 0.6,
          intentCategory: top.apiDef?.category || top.apiId,
          apiId: top.apiId,
          pathParams: {},
          queryParams: {}
        };
        console.log('[ROUTER] Fallback selected API:', top.apiId, 'score:', top.score);
      } else {
        // Final fallback: simple keyword substring match across all API keywords
        const allKeywords = registry.apis.flatMap(a => a.keywords || []);
        requiresAPI = allKeywords.some(k => message.toLowerCase().includes(k.toLowerCase()));
      }
    }

    let apiResults = [];
    let apiCallsMade = [];

    if (requiresAPI && apiPlan) {
      // ── Handle low confidence routing ──────────────
      const confidenceThreshold = registry.routingConfig?.confidenceThreshold || 0.7;
      const confidenceResult = handleLowConfidence(apiPlan, confidenceThreshold);
      
      if (confidenceResult.message) {
        console.log(`[ROUTING] ${confidenceResult.message}`);
        if (confidenceResult.needsClarification) {
          send('status', { step: 'low_confidence', message: `⚠️ ${confidenceResult.message}` });
        }
      }

      // ── STEP 2: Plan & execute ─────────────────────
      send('status', { step: 'plan_api', message: '⚙️ Planning API calls...' });

      // ── Dependency chain path ─────────────────────
      if (apiPlan.chainId) {
        const chain = (registry.dependencyChains || []).find(c => c.id === apiPlan.chainId);
        if (chain) {
          send('status', { step: 'chain_start', message: `🔗 Running dependency chain: ${chain.id}...` });
          try {
            apiResults = await executeDependencyChain(chain, message, jwtToken, send, timeZone);
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
          ? [{ apiId: apiPlan.apiId, pathParams: apiPlan.pathParams, queryParams: apiPlan.queryParams, requestBody: apiPlan.requestBody, clientFilter: apiPlan.clientFilter }]
          : [];

      for (const call of callsToMake) {
        const apiDef = registry.apis.find(a => a.id === call.apiId);
        if (!apiDef) {
          send('error_partial', { message: `Unknown API: ${call.apiId}` });
          continue;
        }

        // ── Validate routing decision ──────────────────
        const validation = validateRouting(call, apiDef, message);
        if (!validation.valid) {
          console.log(`[ROUTING VALIDATION] Warnings: ${validation.warnings.join('; ')}`);
          // Log missing params but don't block - let the API return an error if needed
          if (validation.missing.length > 0) {
            send('status', { 
              step: 'validation_warning', 
              message: `⚠️ Missing parameters: ${validation.missing.map(p => p.name).join(', ')}. Using defaults.`
            });
          }
        }
        
        // Log routing decision
        logRoutingDecision({
          apiPlan: call,
          validation,
          confidence: apiPlan.confidence,
          userMessage: message,
          timestamp: Date.now()
        });

        // ── Normalize query params for this API ────────
        const normalizedApiParams = normalizeQueryParams(
          apiDef, 
          call.queryParams, 
          routingConfig.dateParamAliases
        );
        
        // Resolve temporal values (yesterday, last week, etc.)
        const resolvedQueryParams = resolveTemporalQueryParams(normalizedApiParams, timeZone);
        console.log(`[DATE RESOLUTION] Before:`, normalizedApiParams);
        console.log(`[DATE RESOLUTION] After:`, resolvedQueryParams);
        console.log(`[DATE RESOLUTION] Has date params:`, Object.keys(resolvedQueryParams).filter(k => ['from', 'to', 'start', 'end', 'startDate', 'endDate', 'dateFrom', 'dateTo'].includes(k)));
        const fullUrl = buildApiUrl(registry.baseUrl, apiDef.path, call.pathParams, resolvedQueryParams);

        const apiCallInfo = { apiId: call.apiId, name: apiDef.name, method: apiDef.method, url: fullUrl, body: call.requestBody || null };

        send('api_call', { method: apiDef.method, url: fullUrl, body: call.requestBody || null, name: apiDef.name });
        send('status', { step: 'execute', message: TEST_LOCALLY ? `🧪 [MOCK] Loading ${apiDef.name}...` : `🔍 Calling ${apiDef.name}...` });

        try {
          let result;
          if (TEST_LOCALLY) {
            result = getMockResponse(call.apiId);
            console.log(`[TEST_LOCALLY] Using mock data for: ${call.apiId}`);
          } else {
            result = await executeAPICall(apiCallInfo, jwtToken);
          }

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

          // Send data with API metadata for period comparison feature
          const metadata = {
            apiId: call.apiId,
            pathParams: call.pathParams || {},
            queryParams: resolvedQueryParams || {}
          };
          console.log(`[METADATA] Sending to frontend:`, JSON.stringify(metadata, null, 2));
          
          send('data', { 
            rows: resultArray, 
            count: resultArray.length, 
            apiName: apiDef.name,
            // Store API call info for frontend to reuse in period comparison
            metadata
          });

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

    console.log(`[INTERPRET] Using analyzer model: ${analyzerModel || 'default'}`);
    const interpretResult = await callOllama(interpretPrompt, '', false, analyzerModel || null);

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

// ─────────────────────────────────────────────
// POST /api/compare-period — Period-over-period comparison
// ─────────────────────────────────────────────
router.post('/compare-period', async (req, res) => {
  const { apiId, pathParams = {}, queryParams = {}, userMessage, jwtToken, clientTimeZone, analyzerModel } = req.body;
  const timeZone = clientTimeZone || 'UTC';

  console.log(`[COMPARE-PERIOD] API: ${apiId}, Params:`, queryParams);

  if (!apiId) {
    return res.status(400).json({ success: false, error: 'apiId is required' });
  }

  try {
    const registry = getRegistry();
    const { calculatePreviousPeriod } = require('../core/dateRange');
    const { buildComparisonPrompt } = require('../core/prompts');

    const apiDef = registry.apis.find(a => a.id === apiId);
    if (!apiDef) {
      return res.status(404).json({ success: false, error: `API ${apiId} not found in registry` });
    }

    // Detect date parameter keys in queryParams
    const dateKeys = ['from', 'to', 'start', 'end', 'startDate', 'endDate', 'dateFrom', 'dateTo'];
    const fromKeys = ['from', 'start', 'startDate', 'dateFrom'];
    const toKeys = ['to', 'end', 'endDate', 'dateTo'];
    const fromKey = fromKeys.find(k => queryParams[k] !== undefined && queryParams[k] !== null && queryParams[k] !== '');
    const toKey = toKeys.find(k => queryParams[k] !== undefined && queryParams[k] !== null && queryParams[k] !== '');

    console.log(`[COMPARE-PERIOD] fromKey=${fromKey} (${queryParams[fromKey]}), toKey=${toKey} (${queryParams[toKey]})`);
    console.log(`[COMPARE-PERIOD] All queryParams:`, JSON.stringify(queryParams));

    if (!fromKey || !toKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Date range parameters (from/to or start/end) are required for period comparison' 
      });
    }

    const currentFrom = queryParams[fromKey];
    const currentTo = queryParams[toKey];

    if (!currentFrom || !currentTo) {
      return res.status(400).json({ 
        success: false, 
        error: `Date values are empty. fromKey=${fromKey} value=${currentFrom}, toKey=${toKey} value=${currentTo}` 
      });
    }

    // Calculate previous period
    const prevPeriod = calculatePreviousPeriod(currentFrom, currentTo, timeZone);

    if (!prevPeriod || !prevPeriod.from || !prevPeriod.to) {
      return res.status(400).json({ 
        success: false, 
        error: `Could not calculate previous period from "${currentFrom}" to "${currentTo}"` 
      });
    }

    // Build API URLs for both periods
    const currentUrl = buildApiUrl(registry.baseUrl, apiDef.path, pathParams, queryParams);
    const prevQueryParams = { ...queryParams, [fromKey]: prevPeriod.from, [toKey]: prevPeriod.to };
    const prevUrl = buildApiUrl(registry.baseUrl, apiDef.path, pathParams, prevQueryParams);

    console.log(`[COMPARE-PERIOD] Current: ${currentFrom} to ${currentTo}`);
    console.log(`[COMPARE-PERIOD] Previous: ${prevPeriod.from} to ${prevPeriod.to} (${prevPeriod.duration})`);

    // Call API for both periods
    let currentData, previousData;

    if (TEST_LOCALLY) {
      // In test mode, use mock data (same for both periods - in real scenario these would differ)
      currentData = getMockResponse(apiId);
      previousData = getMockResponse(apiId);
      console.log(`[COMPARE-PERIOD] Using mock data for both periods`);
    } else {
      const currentCall = { apiId, name: apiDef.name, method: apiDef.method, url: currentUrl, body: null };
      const prevCall = { apiId, name: apiDef.name, method: apiDef.method, url: prevUrl, body: null };

      [currentData, previousData] = await Promise.all([
        executeAPICall(currentCall, jwtToken),
        executeAPICall(prevCall, jwtToken)
      ]);
    }

    // Normalize to arrays
    const currentArray = Array.isArray(currentData) ? currentData : [currentData];
    const prevArray = Array.isArray(previousData) ? previousData : [previousData];

    // Build comparison prompt
    const comparisonPrompt = buildComparisonPrompt(
      userMessage || 'Compare data',
      currentArray,
      prevArray,
      {
        current: { from: currentFrom, to: currentTo },
        previous: { from: prevPeriod.from, to: prevPeriod.to },
        duration: prevPeriod.duration
      }
    );

    // Call Ollama for analysis
    const analysisResult = await callOllama(comparisonPrompt, '', false, analyzerModel || null);

    res.json({
      success: true,
      analysis: analysisResult.content,
      thinking: analysisResult.thinking || null,
      periods: {
        current: { from: currentFrom, to: currentTo, recordCount: currentArray.length },
        previous: { from: prevPeriod.from, to: prevPeriod.to, recordCount: prevArray.length },
        duration: prevPeriod.duration
      }
    });

  } catch (err) {
    console.error('[COMPARE-PERIOD] Error:', err);
    res.status(500).json({ success: false, error: err.message || 'Comparison failed' });
  }
});

module.exports = router;
