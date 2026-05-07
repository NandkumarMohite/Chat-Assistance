// ─────────────────────────────────────────────
// core/executor.js — HTTP execution engine:
//   executeAPICall, applyClientFilter, executeDependencyChain
// ─────────────────────────────────────────────

const fetch = require('node-fetch');
const { getRegistry } = require('./registry');

// ── Execute a single HTTP call to the ShamStore backend ──
async function executeAPICall(apiPlan, jwtToken) {
  const { method, url, body } = apiPlan;

  const fetchOptions = {
    method: method.toUpperCase(),
    headers: { 'Content-Type': 'application/json' },
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

  return response.json();
}

// ── Apply a client-side filter to an array of records ──
function applyClientFilter(records, clientFilter, send) {
  const { field, value, operator = 'eq' } = clientFilter;
  const filterVal = String(value || '').toLowerCase();
  const before = records.length;

  const filtered = records.filter(record => {
    const recVal = record[field];
    if (recVal === undefined || recVal === null) return false;
    const recStr = String(recVal).toLowerCase();
    switch (operator) {
      case 'contains': return recStr.includes(filterVal);
      case 'gt':  return parseFloat(recVal) >  parseFloat(value);
      case 'lt':  return parseFloat(recVal) <  parseFloat(value);
      case 'gte': return parseFloat(recVal) >= parseFloat(value);
      case 'lte': return parseFloat(recVal) <= parseFloat(value);
      default:    return recStr === filterVal; // eq
    }
  });

  console.log(`[CLIENT FILTER] ${field} ${operator} "${value}": ${before} → ${filtered.length} records`);
  send('status', { step: 'filter', message: `🔎 Filtered by ${field}="${value}": ${filtered.length} match(es)` });
  return filtered;
}

// ── Execute a full dependency chain step-by-step ──
async function executeDependencyChain(chain, userMessage, jwtToken, send) {
  const registry = getRegistry();
  const context  = {}; // holds extracted values e.g. resolvedUserId
  const allResults = [];

  for (let i = 0; i < chain.steps.length; i++) {
    const step   = chain.steps[i];
    const apiDef = registry.apis.find(a => a.id === step.apiId);
    if (!apiDef) throw new Error(`Chain step references unknown API: ${step.apiId}`);

    // Resolve path params — replace $varName with context values
    const resolvedPathParams = {};
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
    const fullUrl = `${registry.baseUrl}${urlPath}`;

    send('api_call', { method: apiDef.method, url: fullUrl, body: null, name: apiDef.name });
    send('status', { step: `chain_${i}`, message: `🔗 Step ${i + 1}/${chain.steps.length}: Calling ${apiDef.name}...` });

    const result      = await executeAPICall({ method: apiDef.method, url: fullUrl, body: null }, jwtToken);
    let resultArray = Array.isArray(result) ? result : [result];

    // If this step has a filter + extract, find the matching record and save the field
    if (step.filterBy && step.extractField && step.saveAs) {
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

      // Show only the matched record in the UI
      send('data', { rows: [matched], count: 1, apiName: `${apiDef.name} (matched ${step.filterBy})` });
    } else {
      send('data', { rows: resultArray, count: resultArray.length, apiName: apiDef.name });
    }

    allResults.push({ apiId: step.apiId, name: apiDef.name, data: result });
  }

  return allResults;
}

module.exports = { executeAPICall, applyClientFilter, executeDependencyChain };
