// ─────────────────────────────────────────────
// core/ollama.js — Ollama API interaction helpers
// ─────────────────────────────────────────────

const fetch = require('node-fetch');
const { OLLAMA_BASE_URL, OLLAMA_MODEL } = require('./config');

// ── Call Ollama (non-streaming) ───────────────
async function callOllama(systemPrompt, userMessage, enableThink = false) {
  const body = {
    model: OLLAMA_MODEL,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  },
    ],
  };

  // Only add think param if the model supports it (e.g. deepseek-r1, qwen3)
  if (enableThink) body.think = true;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return {
    thinking: data.message?.thinking || '',
    content:  data.message?.content  || '',
  };
}

// ── Extract JSON from Ollama's text response ─
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

// ── Fetch list of available Ollama models ─────
async function fetchOllamaModels() {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  const data = await response.json();
  return data.models || [];
}

module.exports = { callOllama, extractJSON, fetchOllamaModels };
