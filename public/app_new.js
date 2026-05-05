/* ─────────────────────────────
   ShamStore AI Chat — Frontend JS
   (API-powered, no DB calls)
   ───────────────────────────── */

const API_BASE = window.location.origin;

// ── State ──
let isStreaming = false;
let conversation = [];
let selectedModel = 'deepseek-r1';
let jwtToken = localStorage.getItem('shamstore_jwt') || null;

// ── DOM refs ──
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const charCount = document.getElementById('charCount');
const statusPill = document.getElementById('statusPill');
const statusText = statusPill.querySelector('.status-text');
const backendPill = document.getElementById('backendPill');
const backendText = backendPill.querySelector('.status-text');
const modelSelect = document.getElementById('modelSelect');
const welcomeScreen = document.getElementById('welcomeScreen');
const historyList = document.getElementById('historyList');
const queryChips = document.getElementById('queryChips');
const sidebar = document.getElementById('sidebar');
const newChatBtn = document.getElementById('newChatBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebarToggle = document.getElementById('sidebarToggle');
const headerSubtitle = document.getElementById('headerSubtitle');

// ── Init ──
(async function init() {
  await checkHealth();
  await loadModels();
  setupEventListeners();
  updateTime();
})();

// ── Health check ──
async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();

    // Ollama status
    if (data.ollama === 'connected') {
      statusPill.className = 'status-pill online';
      statusText.textContent = `Ollama · ${data.model}`;
      headerSubtitle.textContent = `Connected to ${data.model}`;
    } else {
      statusPill.className = 'status-pill offline';
      statusText.textContent = 'Ollama offline';
      headerSubtitle.textContent = 'Ollama not running — start it first';
    }

    // Backend status
    if (data.backend === 'connected') {
      backendPill.className = 'status-pill backend-status online';
      backendText.textContent = `Backend · ${data.registeredAPIs} APIs`;
    } else {
      backendPill.className = 'status-pill backend-status offline';
      backendText.textContent = `Backend offline`;
    }
  } catch {
    statusPill.className = 'status-pill offline';
    statusText.textContent = 'Server offline';
    backendPill.className = 'status-pill backend-status offline';
    backendText.textContent = 'Backend offline';
  }
}

// ── Load available models ──
async function loadModels() {
  try {
    const res = await fetch(`${API_BASE}/api/models`);
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      modelSelect.innerHTML = data.models
        .map(m => `<option value="${m.name}">${m.name}</option>`)
        .join('');
      selectedModel = data.models[0].name;
    }
  } catch { /* keep defaults */ }
}

// ── Event Listeners ──
function setupEventListeners() {
  sendBtn.addEventListener('click', sendMessage);

  messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  messageInput.addEventListener('input', () => {
    const len = messageInput.value.length;
    charCount.textContent = `${len}/2000`;
    sendBtn.disabled = len === 0 || isStreaming;
    autoResize(messageInput);
  });

  modelSelect.addEventListener('change', () => {
    selectedModel = modelSelect.value;
    headerSubtitle.textContent = `Using model: ${selectedModel}`;
  });

  newChatBtn.addEventListener('click', clearChat);
  clearChatBtn.addEventListener('click', clearChat);

  mobileMenuBtn.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
  sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

  queryChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (isStreaming) return;
      messageInput.value = chip.dataset.query;
      messageInput.dispatchEvent(new Event('input'));
      sendMessage();
      // close sidebar on mobile
      sidebar.classList.remove('mobile-open');
    });
  });
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

// ── Send message ──
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isStreaming) return;

  // Hide welcome
  if (welcomeScreen) welcomeScreen.style.display = 'none';

  // Append user message
  appendUserMessage(text);
  conversation.push({ role: 'user', content: text });

  // Clear input
  messageInput.value = '';
  messageInput.style.height = 'auto';
  charCount.textContent = '0/2000';
  sendBtn.disabled = true;
  isStreaming = true;

  // Add to history
  addToHistory(text);

  // Create AI bubble
  const aiBubble = createAIBubble();
  messagesArea.appendChild(aiBubble);
  scrollToBottom();

  const statusSteps = aiBubble.querySelector('.status-steps');
  const thinkingBlock = aiBubble.querySelector('.thinking-block');
  const thinkingContent = aiBubble.querySelector('.thinking-content');
  const apiBlock = aiBubble.querySelector('.api-block');
  const apiCode = aiBubble.querySelector('.api-code');
  const dataBlock = aiBubble.querySelector('.data-block');
  const dataCount = aiBubble.querySelector('.data-count');
  const answerDiv = aiBubble.querySelector('.answer-content');
  const timeDiv = aiBubble.querySelector('.msg-time');
  let currentStep = null;

  function addStep(id, text) {
    if (currentStep) currentStep.querySelector('.step-spinner')?.remove(), currentStep.classList.add('done'), currentStep.insertAdjacentHTML('afterbegin', '<span class="step-check">✓</span>');
    const div = document.createElement('div');
    div.className = 'step-item';
    div.id = 'step-' + id;
    div.innerHTML = `<div class="step-spinner"></div><span>${text}</span>`;
    statusSteps.appendChild(div);
    currentStep = div;
    scrollToBottom();
  }

  function finishSteps() {
    if (currentStep) {
      currentStep.querySelector('.step-spinner')?.remove();
      currentStep.classList.add('done');
      currentStep.insertAdjacentHTML('afterbegin', '<span class="step-check">✓</span>');
    }
  }

  try {
    console.log("Sending chat request with JWT:", jwtToken ? "YES" : "NO");
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, conversationHistory: conversation, model: selectedModel, jwtToken })
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEventType = 'message';

    function processSSELines(text) {
      const lines = text.split('\n');
      const leftover = lines.pop(); // incomplete last line stays in buffer
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          try {
            const payload = JSON.parse(line.slice(5).trim());
            handleSSEEvent(currentEventType, payload);
          } catch { /* skip malformed */ }
          currentEventType = 'message'; // reset after consuming
        }
        // empty lines are SSE delimiters, ignored
      }
      return leftover;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = processSSELines(buffer);
    }
    // flush any remaining data in buffer
    if (buffer.trim()) processSSELines(buffer + '\n');

  } catch (err) {
    finishSteps();
    answerDiv.innerHTML = `<div class="error-bubble">❌ ${escHtml(err.message)}</div>`;
    answerDiv.removeAttribute('hidden');
  } finally {
    finishSteps();
    timeDiv.textContent = new Date().toLocaleTimeString();
    isStreaming = false;
    sendBtn.disabled = false;
    messageInput.focus();
    scrollToBottom();
  }

  // ── SSE handler ──
  async function handleSSEEvent(event, data) {
    switch (event) {
      case 'status':
        addStep(data.step, data.message);
        break;

      case 'auth_token':
        jwtToken = data.token;
        localStorage.setItem('shamstore_jwt', jwtToken);
        console.log("Saved JWT Token to localStorage!");
        break;

      case 'thinking':
        if (data.content?.trim()) {
          thinkingContent.textContent = data.content;
          thinkingBlock.removeAttribute('hidden');
        }
        break;

      case 'api_call': {
        // Show the API call that was made (replaces SQL display)
        const callText = `${data.method} ${data.url}${data.body ? '\n\nBody:\n' + JSON.stringify(data.body, null, 2) : ''}`;
        apiCode.textContent = callText;
        apiBlock.querySelector('.api-title').textContent = data.name || 'API Call';
        apiBlock.removeAttribute('hidden');
        apiBlock.querySelector('.copy-btn').onclick = () => {
          navigator.clipboard.writeText(callText);
          apiBlock.querySelector('.copy-btn').textContent = '✓ Copied!';
          setTimeout(() => apiBlock.querySelector('.copy-btn').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`, 1500);
        };
        scrollToBottom();
        break;
      }

      case 'data':
        if (data.rows && data.rows.length > 0) {
          renderTable(dataBlock, data.rows);
          dataCount.textContent = `${data.count} record${data.count !== 1 ? 's' : ''} returned${data.apiName ? ` · ${data.apiName}` : ''}`;
          dataBlock.removeAttribute('hidden');
        }
        scrollToBottom();
        break;

      case 'error_partial':
        answerDiv.innerHTML = `<div class="error-bubble">⚠️ ${escHtml(data.message)}</div>`;
        answerDiv.removeAttribute('hidden');
        break;

      case 'answer':
        answerDiv.innerHTML = markdownToHtml(data.content);
        answerDiv.removeAttribute('hidden');
        conversation.push({ role: 'assistant', content: data.content });
        scrollToBottom();
        break;

      case 'error':
        finishSteps();
        answerDiv.innerHTML = `<div class="error-bubble">❌ ${escHtml(data.message)}</div>`;
        answerDiv.removeAttribute('hidden');
        break;
    }
  }
}

// ── Render data table ──
function renderTable(container, rows) {
  const table = container.querySelector('.data-table');
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);

  table.innerHTML = `
    <thead><tr>${cols.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${cols.map(c => `<td>${escHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>
  `;
}

// ── Create AI bubble ──
function createAIBubble() {
  const tmpl = document.getElementById('aiMsgTemplate');
  const node = tmpl.content.cloneNode(true);
  return node.firstElementChild;
}

// ── Append user message ──
function appendUserMessage(text) {
  const tmpl = document.getElementById('userMsgTemplate');
  const node = tmpl.content.cloneNode(true);
  node.querySelector('.msg-content').textContent = text;
  messagesArea.appendChild(node);
  scrollToBottom();
}

// ── Clear chat ──
function clearChat() {
  conversation = [];
  messagesArea.innerHTML = '';
  // Re-add welcome screen
  const ws = document.createElement('div');
  ws.id = 'welcomeScreen';
  ws.className = 'welcome-screen';
  ws.innerHTML = welcomeScreenHTML();
  messagesArea.appendChild(ws);
  historyList.innerHTML = '<div class="history-empty">No history yet</div>';
  messageInput.focus();
}

function welcomeScreenHTML() {
  return `
    <div class="welcome-glow"></div>
    <div class="welcome-icon">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    </div>
    <h2 class="welcome-title">Good ${getTimeOfDay()}! 👋</h2>
    <p class="welcome-desc">I'm your ShamStore AI Assistant powered by Ollama. Ask me questions in plain English — I'll call the right API and translate results into clear, human-readable answers.</p>
    <div class="welcome-features">
      <div class="feature-card"><div class="feature-icon">🧠</div><div class="feature-text"><strong>Smart Routing</strong><span>Ollama identifies which API to call automatically</span></div></div>
      <div class="feature-card"><div class="feature-icon">🔌</div><div class="feature-text"><strong>API Powered</strong><span>Connects to your ShamStore backend in real time</span></div></div>
      <div class="feature-card"><div class="feature-icon">💬</div><div class="feature-text"><strong>Human Answers</strong><span>Raw API data decoded into plain language</span></div></div>
    </div>`;
}

// ── History ──
function addToHistory(text) {
  const empty = historyList.querySelector('.history-empty');
  if (empty) empty.remove();
  const item = document.createElement('div');
  item.className = 'history-item';
  item.textContent = text.length > 40 ? text.slice(0, 40) + '…' : text;
  item.title = text;
  historyList.insertBefore(item, historyList.firstChild);
}

// ── Scroll ──
function scrollToBottom() {
  messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
}

// ── Helpers ──
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function updateTime() {
  // no-op, kept for future use
}

// ── Minimal Markdown → HTML ──
function markdownToHtml(md) {
  if (!md) return '';
  let html = escHtml(md);

  // Unescape for processing (we'll re-escape inline code later)
  html = md;

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${lang}">${escHtml(code.trim())}</code></pre>`);

  // Inline code
  html = html.replace(/`([^`]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`);

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Tables
  html = html.replace(/(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+)/g, match => {
    const lines = match.trim().split('\n');
    const headers = lines[0].split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
    const rows = lines.slice(2).map(l => {
      const cells = l.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  // Blockquote
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/((?:^[-*] .+\n?)+)/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Paragraphs (double newline)
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Single newlines inside paragraphs
  html = html.replace(/([^>])\n([^<])/g, '$1<br>$2');

  // Clean empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}
