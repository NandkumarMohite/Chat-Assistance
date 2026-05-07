// ─────────────────────────────────────────────
// core/prompts.js — All LLM prompt templates in one place.
//   Edit this file to tune AI behaviour without touching business logic.
// ─────────────────────────────────────────────

// ── Intent classification + API routing prompt ─
function buildClassifyPrompt(apiDescription, chainDescriptions) {
  return `You are an intelligent API routing assistant. Determine if the user's question requires calling an API or can be answered from general knowledge.

${apiDescription}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "requiresAPI": true|false,
  "reason": "brief explanation",
  "chainId": "dependency chain id to use, or null",
  "apiId": "the api id from the registry to call, or null",
  "pathParams": { "paramName": "value" },
  "requestBody": { ... } or null,
  "clientFilter": { "field": "fieldName", "value": "filterValue", "operator": "eq|contains|gt|lt|gte|lte" } or null,
  "multipleAPIs": false,
  "apiCalls": []
}

RULES:
- If the question needs data from the backend, set requiresAPI to true and pick the correct API.
- If the user identifies an entity by phone, email, or name (not by ID), and a DEPENDENCY CHAIN exists for it, set chainId to that chain's id instead of apiId.
- Available dependency chains:
${chainDescriptions}
- Fill in pathParams if the API path has {placeholders} — extract values from the user message.
- Fill in requestBody for POST/PUT methods with the data the user provided.
- CLIENT-SIDE FILTER FALLBACK: If the user wants to filter results by a field (e.g. role, category, status, name) but no API directly supports that filter as a parameter, call the closest "get all" API and set clientFilter with the field name, value, and optional operator.
  Operators: eq (default, exact match), contains (substring), gt, lt, gte, lte (numeric comparisons).
  Example: "show me all users with role OWNER" → apiId: get_all_users, clientFilter: { "field": "role", "value": "OWNER" }
  Example: "show products with stock more than 0" → apiId: get_all_products, clientFilter: { "field": "stock", "value": "0", "operator": "gt" }
- If you need to call multiple APIs, set multipleAPIs to true and list them in apiCalls array.
- If the user's question is general knowledge (e.g. "what is Java?"), set requiresAPI to false.
- apiId must exactly match one of the API ids listed above.

Do NOT include any other text, markdown, or explanation outside the JSON.`;
}

// ── Interpret API results as a human-readable answer ─
function buildInterpretPrompt(userMessage, apiResults) {
  return `You are a friendly and insightful assistant for the ShamStore application.

The user asked: "${userMessage}"

I called the following API(s) and got these results:
${JSON.stringify(apiResults, null, 2)}

Instructions:
- Write a clear, friendly, human-readable answer based on the API data
- Use bullet points, tables (markdown), or numbered lists where helpful
- Highlight key insights and numbers
- If the result has multiple items, summarize patterns and standout values
- Be conversational but precise
- Do NOT mention raw JSON, API endpoints, or technical implementation details
- If there was an authentication error, tell the user to sign in
- If there was any other error, apologize and explain simply
- Format currencies and numbers nicely`;
}

// ── General knowledge answer prompt (no API needed) ─
function buildGeneralPrompt(userMessage, conversationHistory) {
  const historyContext = conversationHistory.length > 0
    ? `Conversation context:\n${JSON.stringify(conversationHistory.slice(-4))}\n\n`
    : '';

  return `You are a helpful AI assistant for the ShamStore application. Answer the user's question in a friendly, concise, and informative way.

${historyContext}User asked: "${userMessage}"

Provide a well-structured, markdown-formatted answer.`;
}

module.exports = { buildClassifyPrompt, buildInterpretPrompt, buildGeneralPrompt };
