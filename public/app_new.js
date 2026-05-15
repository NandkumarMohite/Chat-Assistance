/* ─────────────────────────────
   Comau AI Chat — Frontend JS
   (API-powered, no DB calls)
   ───────────────────────────── */

const API_BASE = window.location.origin;

// ── State ──
let isStreaming = false;
let conversation = [];
let selectedModel = 'deepseek-r1';
let jwtToken = localStorage.getItem('comau_jwt') || null;

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
const themeToggleBtn = document.getElementById('themeToggleBtn');

// ── Theme Init ──
let currentTheme = localStorage.getItem('comau_theme') || 'dark';
if (currentTheme === 'light') document.documentElement.classList.add('light-theme');

// ── Init ──
(async function init() {
  // Set dynamic welcome
  const welcomeTitle = document.getElementById('welcomeTitle');
  if (welcomeTitle) welcomeTitle.textContent = `Good ${getTimeOfDay()}! 👋`;

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

    // Backend status (checked by server using BACKEND_URL from .env)
    if (data.backend === 'connected') {
      backendPill.className = 'status-pill backend-status online';
      backendText.textContent = `Backend · ${data.registeredAPIs} APIs`;
    } else {
      backendPill.className = 'status-pill backend-status offline';
      backendText.textContent = 'Backend offline';
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

  themeToggleBtn.addEventListener('click', () => {
    if (document.documentElement.classList.contains('light-theme')) {
      document.documentElement.classList.remove('light-theme');
      localStorage.setItem('comau_theme', 'dark');
      themeToggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>`;
    } else {
      document.documentElement.classList.add('light-theme');
      localStorage.setItem('comau_theme', 'light');
      themeToggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    }
  });

  // Set initial icon based on theme
  if (currentTheme === 'light') {
    themeToggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }

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
    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, conversationHistory: conversation, model: selectedModel, jwtToken, clientTimeZone })
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
        localStorage.setItem('comau_jwt', jwtToken);
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
          renderRawJson(dataBlock, data.rows);
          setupChartBlock(dataBlock, data.rows);
          setupAnalyzeBlock(dataBlock, data.rows);
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

// ── Smart Data Renderer ──
function renderTable(container, rows) {
  const tableContainer = container.querySelector('.table-scroll');
  if (!rows.length) return;

  const data = rows.length === 1 ? rows[0] : rows;

  // Detect data pattern and render appropriately
  const html = detectAndRender(data);
  tableContainer.innerHTML = html;
}

function detectAndRender(data) {
  // Array of flat objects → simple table
  if (Array.isArray(data) && data.length > 0 && isFlat(data[0])) {
    return renderFlatTable(data);
  }

  // Array of objects with nested arrays → hierarchical
  if (Array.isArray(data) && data.length > 0 && !isFlat(data[0])) {
    return renderSmartObject(data[0]);
  }

  // Single object
  if (typeof data === 'object' && !Array.isArray(data)) {
    return renderSmartObject(data);
  }

  // Fallback: basic table
  return renderFlatTable(Array.isArray(data) ? data : [data]);
}

function isFlat(obj) {
  if (!obj || typeof obj !== 'object') return true;
  return Object.values(obj).every(v => v === null || v === undefined || typeof v !== 'object' || (Array.isArray(v) && v.every(i => typeof i !== 'object')));
}

function renderSmartObject(obj) {
  let html = '';

  // Separate scalar fields, name-value arrays, nested arrays, and nested objects
  const scalars = {};
  const nameValueArrays = [];
  const nestedArrays = [];
  const nestedObjects = [];

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'message' || key === 'unit') continue; // skip meta fields
    
    if (value === null || value === undefined || typeof value !== 'object') {
      scalars[key] = value;
    } else if (Array.isArray(value)) {
      // Check if it's a name-value pair array (like totalParameters)
      if (value.length > 0 && value[0] && value[0].name !== undefined && value[0].value !== undefined && Object.keys(value[0]).length <= 3) {
        nameValueArrays.push({ key, items: value });
      } else if (value.length > 0 && typeof value[0] === 'object') {
        nestedArrays.push({ key, items: value });
      }
    } else if (typeof value === 'object') {
      // Check if it's a time-grouped object (daily/weekly/monthly)
      if (value.daily || value.weekly || value.monthly) {
        nestedObjects.push({ key, type: 'timeSeries', data: value });
      } else {
        nestedObjects.push({ key, type: 'object', data: value });
      }
    }
  }

  // 1. Render scalar fields as summary cards
  if (Object.keys(scalars).length > 0) {
    html += '<div class="data-cards">';
    for (const [key, value] of Object.entries(scalars)) {
      const label = formatFieldLabel(key);
      const displayVal = formatDisplayValue(key, value);
      html += `<div class="data-card"><div class="data-card-value">${escHtml(displayVal)}</div><div class="data-card-label">${escHtml(label)}</div></div>`;
    }
    html += '</div>';
  }

  // 2. Render name-value arrays as cards
  for (const { key, items } of nameValueArrays) {
    html += `<div class="data-section-header">${escHtml(formatFieldLabel(key))}</div>`;
    html += '<div class="data-cards">';
    for (const item of items) {
      const displayVal = formatDisplayValue(item.name, item.value);
      html += `<div class="data-card"><div class="data-card-value">${escHtml(displayVal)}</div><div class="data-card-label">${escHtml(item.name)}</div></div>`;
    }
    html += '</div>';
  }

  // 3. Render time-series objects (daily/weekly/monthly)
  for (const { key, type, data: nestedData } of nestedObjects) {
    if (type === 'timeSeries') {
      html += `<div class="data-section-header">${escHtml(formatFieldLabel(key))}</div>`;
      for (const period of ['daily', 'weekly', 'monthly']) {
        if (nestedData[period] && nestedData[period].data && nestedData[period].data.length > 0) {
          html += `<div class="data-subsection-header">${escHtml(nestedData[period].range || capitalizeFirst(period))}</div>`;
          html += renderFlatTable(nestedData[period].data);
        }
      }
    } else if (type === 'object') {
      html += `<div class="data-section-header">${escHtml(formatFieldLabel(key))}</div>`;
      html += renderSmartObject(nestedData);
    }
  }

  // 4. Render nested arrays as hierarchical tables
  for (const { key, items } of nestedArrays) {
    html += `<div class="data-section-header">${escHtml(formatFieldLabel(key))}</div>`;
    html += renderHierarchicalArray(items);
  }

  return html || '<table class="data-table"><tbody><tr><td>No displayable data</td></tr></tbody></table>';
}

function renderHierarchicalArray(items) {
  if (!items.length) return '';
  let html = '';

  // Separate flat fields from nested arrays/objects for each item
  for (const item of items) {
    const flat = {};
    const nested = [];

    for (const [key, value] of Object.entries(item)) {
      if (value === null || value === undefined || typeof value !== 'object') {
        flat[key] = value;
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        nested.push({ key, items: value });
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Check for time series
        if (value.daily || value.weekly || value.monthly) {
          nested.push({ key, type: 'timeSeries', data: value });
        }
      }
    }

    // Render parent row as a header card
    const nameField = flat.lineName || flat.stationName || flat.modelName || flat.modelId || flat.opId || '';
    const idField = flat.lineId || flat.stationId || flat.componentId || '';
    
    if (nameField || idField) {
      html += `<div class="hierarchy-item">`;
      html += `<div class="hierarchy-header">${escHtml(nameField)}${idField ? ` <span class="hierarchy-id">(ID: ${idField})</span>` : ''}</div>`;
      
      // Show flat metrics as inline cards
      const metricFields = Object.entries(flat).filter(([k]) => 
        !['lineId', 'stationId', 'componentId', 'lineName', 'stationName', 'modelName', 'modelId', 'isLastStation', 'lineId'].includes(k)
      );
      
      if (metricFields.length > 0) {
        html += '<div class="data-cards compact">';
        for (const [key, value] of metricFields) {
          html += `<div class="data-card mini"><div class="data-card-value">${escHtml(formatDisplayValue(key, value))}</div><div class="data-card-label">${escHtml(formatFieldLabel(key))}</div></div>`;
        }
        html += '</div>';
      }

      // Render nested arrays recursively
      for (const n of nested) {
        if (n.type === 'timeSeries') {
          html += `<div class="data-subsection-header">${escHtml(formatFieldLabel(n.key))}</div>`;
          for (const period of ['daily', 'weekly', 'monthly']) {
            if (n.data[period] && n.data[period].data && n.data[period].data.length > 0) {
              html += `<div class="data-subsection-header">${escHtml(n.data[period].range || capitalizeFirst(period))}</div>`;
              html += renderFlatTable(n.data[period].data);
            }
          }
        } else {
          html += `<div class="data-subsection-header">${escHtml(formatFieldLabel(n.key))}</div>`;
          html += renderHierarchicalArray(n.items);
        }
      }

      html += '</div>';
    } else {
      // No clear name/id — just render as flat table row
      html += renderFlatTable([item]);
    }
  }

  return html;
}

function renderFlatTable(rows) {
  if (!rows || !rows.length) return '';
  const cols = Object.keys(rows[0]).filter(c => {
    const val = rows[0][c];
    return val === null || val === undefined || typeof val !== 'object' || (Array.isArray(val) && val.length <= 5 && val.every(i => typeof i !== 'object'));
  });
  if (!cols.length) return '';

  return `<table class="data-table">
    <thead><tr>${cols.map(c => `<th>${escHtml(formatFieldLabel(c))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${cols.map(c => `<td>${formatCellValue(row[c])}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function formatFieldLabel(key) {
  // Convert camelCase/snake_case to readable label
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, s => s.toUpperCase())
    .replace(/\b(oee|ct|id)\b/gi, m => m.toUpperCase())
    .replace(/\bRef\b/, 'Reference')
    .replace(/\bAvg\b/, 'Average')
    .replace(/\bStd\b/, 'Std Dev')
    .trim();
}

function formatDisplayValue(key, value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    // Time values in seconds
    if (key.toLowerCase().includes('time') && !key.toLowerCase().includes('cycle') && value > 3600) {
      const hrs = Math.floor(value / 3600);
      const mins = Math.floor((value % 3600) / 60);
      return `${hrs}h ${mins}m`;
    }
    // Percentages (values between 0 and 1 that look like decimals)
    if (key.toLowerCase().includes('percentage') || key.toLowerCase().includes('oeevalue')) {
      if (value <= 1) return `${(value * 100).toFixed(1)}%`;
    }
    // Regular percentage fields
    if (key.toLowerCase().includes('percent') || key.toLowerCase().includes('quality') || 
        key.toLowerCase().includes('availability') || key.toLowerCase().includes('performance') ||
        key.toLowerCase().includes('oee') || key.toLowerCase().includes('productivity')) {
      if (value > 1 && value <= 100) return `${value.toFixed(1)}%`;
    }
    // Seconds for cycle time
    if (key.toLowerCase().includes('cycle') || key.toLowerCase().includes('duration')) {
      return `${value}s`;
    }
    return value.toLocaleString();
  }
  return String(value);
}

function formatCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      if (value.every(i => typeof i !== 'object')) return value.join(', ');
      return `[${value.length} items]`;
    }
    return JSON.stringify(value);
  }
  return escHtml(String(value));
}

function renderRawJson(container, rows) {
  const jsonBlock = container.querySelector('.json-block');
  const jsonContent = container.querySelector('.json-content');
  const jsonCopyBtn = container.querySelector('.json-copy-btn');
  if (!jsonBlock || !jsonContent || !jsonCopyBtn) return;

  const jsonText = JSON.stringify(rows, null, 2);
  jsonContent.textContent = jsonText;
  jsonBlock.removeAttribute('hidden');

  jsonCopyBtn.onclick = () => {
    navigator.clipboard.writeText(jsonText);
    jsonCopyBtn.textContent = '✓ Copied!';
    setTimeout(() => {
      jsonCopyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy JSON`;
    }, 1500);
  };
}

// ── Chart visualization ──
let currentChartInstance = null;
let currentChartData = null;
let currentChartConfig = null;

function setupChartBlock(container, rows) {
  const chartBlock = container.querySelector('.chart-block');
  if (!chartBlock) return;
  
  currentChartData = rows;
  currentChartConfig = null;
  
  // Show chart block (collapsible)
  chartBlock.removeAttribute('hidden');
  
  // DOM elements
  const analyzeStep = chartBlock.querySelector('.chart-analyze-step');
  const analyzeBtn = chartBlock.querySelector('.analyze-data-btn');
  const recommendation = chartBlock.querySelector('.chart-recommendation');
  const recChartType = chartBlock.querySelector('.rec-chart-type');
  const recReasoning = chartBlock.querySelector('.rec-reasoning');
  const generateBtn = chartBlock.querySelector('.generate-chart-btn');
  const chartLoading = chartBlock.querySelector('.chart-loading');
  const loadingText = chartBlock.querySelector('.loading-text');
  const chartError = chartBlock.querySelector('.chart-error');
  const chartContainer = chartBlock.querySelector('.chart-container');
  const chartCanvas = chartBlock.querySelector('.chart-canvas');
  const chartTypeBtns = chartBlock.querySelectorAll('.chart-type-btn');
  
  let selectedType = 'bar';
  
  // Chart type selection
  chartTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      chartTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
    });
  });
  
  // Step 1: Analyze Data button
  analyzeBtn.addEventListener('click', async () => {
    if (!currentChartData || currentChartData.length === 0) return;
    
    // Show loading
    analyzeStep.setAttribute('hidden', '');
    chartLoading.removeAttribute('hidden');
    loadingText.textContent = 'AI is analyzing your data...';
    chartError.setAttribute('hidden', '');
    
    try {
      const response = await fetch(`${API_BASE}/api/chart-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: currentChartData,
          preferredType: null // Let AI decide
        })
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to analyze data');
      }
      
      // Store config
      currentChartConfig = result.config;
      
      // Show recommendation
      recChartType.innerHTML = `<strong>Recommended:</strong> ${capitalizeFirst(result.config.chartType || 'bar')} Chart`;
      recReasoning.textContent = result.config.reasoning || 'Based on your data structure, this chart type provides the best visualization.';
      
      // Update type buttons to match AI suggestion
      selectedType = result.config.chartType || 'bar';
      chartTypeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === selectedType);
      });
      
      recommendation.removeAttribute('hidden');
      
    } catch (error) {
      console.error('Analysis error:', error);
      chartError.textContent = `⚠️ ${error.message}`;
      chartError.removeAttribute('hidden');
      analyzeStep.removeAttribute('hidden');
    } finally {
      chartLoading.setAttribute('hidden', '');
    }
  });
  
  // Step 2: Generate Chart button
  generateBtn.addEventListener('click', async () => {
    if (!currentChartData || currentChartData.length === 0) return;
    
    // Show loading
    chartLoading.removeAttribute('hidden');
    loadingText.textContent = 'Generating chart...';
    chartError.setAttribute('hidden', '');
    generateBtn.disabled = true;
    
    try {
      // For special chart types that need different data format, re-request from backend
      const specialTypes = ['scatter', 'histogram', 'radar', 'stackedBar'];
      if (specialTypes.includes(selectedType)) {
        const response = await fetch(`${API_BASE}/api/chart-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: currentChartData,
            preferredType: selectedType
          })
        });
        
        const result = await response.json();
        if (response.ok && result.success) {
          currentChartConfig = result.config;
        }
      }
      
      // Render chart with selected type
      renderChart(chartCanvas, currentChartConfig, selectedType);
      chartContainer.removeAttribute('hidden');
      
      // Update button to allow regeneration
      generateBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> Regenerate`;
      
    } catch (error) {
      console.error('Chart render error:', error);
      chartError.textContent = `⚠️ ${error.message}`;
      chartError.removeAttribute('hidden');
    } finally {
      chartLoading.setAttribute('hidden', '');
      generateBtn.disabled = false;
    }
  });
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Analyze Data Block (follow-up questions on data) ──
function setupAnalyzeBlock(container, rows) {
  const analyzeBlock = container.querySelector('.analyze-block');
  if (!analyzeBlock) return;

  analyzeBlock.removeAttribute('hidden');

  const quickBtns = analyzeBlock.querySelectorAll('.analyze-chip');
  const analyzeInput = analyzeBlock.querySelector('.analyze-input');
  const analyzeSendBtn = analyzeBlock.querySelector('.analyze-send-btn');
  const analyzeLoading = analyzeBlock.querySelector('.analyze-loading');
  const analyzeResult = analyzeBlock.querySelector('.analyze-result');

  async function runAnalysis(question) {
    if (!question.trim()) return;

    analyzeLoading.removeAttribute('hidden');
    analyzeResult.setAttribute('hidden', '');
    analyzeResult.innerHTML = '';

    try {
      const response = await fetch(`${API_BASE}/api/analyze-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, data: rows })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Analysis failed');
      }

      analyzeResult.innerHTML = markdownToHtml(result.answer);
      analyzeResult.removeAttribute('hidden');
    } catch (error) {
      analyzeResult.innerHTML = `<div class="error-bubble">⚠️ ${escHtml(error.message)}</div>`;
      analyzeResult.removeAttribute('hidden');
    } finally {
      analyzeLoading.setAttribute('hidden', '');
      scrollToBottom();
    }
  }

  // Quick analysis buttons
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const queryType = btn.dataset.query;
      const numericFields = Object.keys(rows[0] || {}).filter(k => typeof rows[0][k] === 'number');
      const mainMetric = numericFields[0] || 'value';

      const queries = {
        max: `What is the maximum ${mainMetric}? Which station/model has it?`,
        min: `What is the minimum ${mainMetric}? Which station/model has it?`,
        best: `Which station or model has the best performance overall?`,
        worst: `Which station or model has the worst performance overall?`,
        average: `What is the average of all numeric metrics? Show a summary.`,
        compare: `Compare all entries and rank them from best to worst.`
      };

      const question = queries[queryType] || queryType;
      analyzeInput.value = question;
      runAnalysis(question);
    });
  });

  // Custom question input
  analyzeSendBtn.addEventListener('click', () => runAnalysis(analyzeInput.value));
  analyzeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runAnalysis(analyzeInput.value);
    }
  });
}

function renderChart(canvas, config, overrideType) {
  // Destroy existing chart
  if (currentChartInstance) {
    currentChartInstance.destroy();
    currentChartInstance = null;
  }
  
  // Map UI type to Chart.js type
  let chartType = overrideType || config.chartType || 'bar';
  const isStacked = overrideType === 'stackedBar' || config.isStacked;
  const isHistogram = overrideType === 'histogram' || config.isHistogram;
  const isScatter = overrideType === 'scatter' || chartType === 'scatter';
  const isRadar = overrideType === 'radar' || chartType === 'radar';
  
  // Normalize chart type for Chart.js
  if (chartType === 'stackedBar' || chartType === 'histogram') chartType = 'bar';
  
  // Detect theme for proper colors
  const isLightTheme = document.documentElement.classList.contains('light-theme');
  
  const textColor = isLightTheme ? '#1f2937' : '#e5e5e5';
  const textMuted = isLightTheme ? '#4b5563' : '#a3a3a3';
  const gridColor = isLightTheme ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
  const tooltipBg = isLightTheme ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.8)';
  const tooltipText = isLightTheme ? '#1f2937' : '#fff';
  const colors = ['#4F46E5', '#7C3AED', '#2563EB', '#0891B2', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: !!config.title,
        text: config.title || '',
        font: { size: 14, weight: '600' },
        color: textColor
      },
      legend: {
        display: config.datasets && config.datasets.length > 1,
        position: 'bottom',
        labels: {
          color: textMuted,
          padding: 15,
          usePointStyle: true
        }
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipText,
        bodyColor: tooltipText,
        borderColor: isLightTheme ? 'rgba(0, 0, 0, 0.1)' : 'transparent',
        borderWidth: isLightTheme ? 1 : 0,
        padding: 12,
        cornerRadius: 8
      }
    }
  };
  
  // Configure scales based on chart type
  if (chartType === 'bar' || chartType === 'line') {
    chartOptions.scales = {
      x: {
        stacked: isStacked,
        title: {
          display: !!config.xAxisLabel,
          text: config.xAxisLabel || '',
          color: textMuted
        },
        ticks: { color: textMuted },
        grid: { color: gridColor }
      },
      y: {
        stacked: isStacked,
        title: {
          display: !!config.yAxisLabel,
          text: config.yAxisLabel || '',
          color: textMuted
        },
        ticks: { color: textMuted },
        grid: { color: gridColor },
        beginAtZero: true
      }
    };
    
    // Histogram: no gap between bars
    if (isHistogram) {
      chartOptions.barPercentage = 1.0;
      chartOptions.categoryPercentage = 1.0;
    }
  }
  
  // Scatter chart scales
  if (isScatter) {
    chartOptions.scales = {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: !!config.xAxisLabel,
          text: config.xAxisLabel || '',
          color: textMuted
        },
        ticks: { color: textMuted },
        grid: { color: gridColor }
      },
      y: {
        title: {
          display: !!config.yAxisLabel,
          text: config.yAxisLabel || '',
          color: textMuted
        },
        ticks: { color: textMuted },
        grid: { color: gridColor },
        beginAtZero: true
      }
    };
  }
  
  // Radar chart options
  if (isRadar) {
    chartOptions.scales = {
      r: {
        angleLines: { color: gridColor },
        grid: { color: gridColor },
        pointLabels: { color: textMuted, font: { size: 11 } },
        ticks: { 
          color: textMuted, 
          backdropColor: isLightTheme ? 'rgba(255, 255, 255, 0.8)' : 'transparent'
        },
        beginAtZero: true
      }
    };
  }
  
  // Process datasets
  const datasets = config.datasets.map((ds, i) => {
    const dataset = { ...ds };
    
    // Ensure colors are set
    if (!dataset.backgroundColor) {
      if (chartType === 'pie' || chartType === 'doughnut') {
        dataset.backgroundColor = (config.labels || []).map((_, idx) => colors[idx % colors.length]);
      } else if (isRadar) {
        dataset.backgroundColor = colors[i % colors.length] + '40';
        dataset.borderColor = colors[i % colors.length];
      } else {
        dataset.backgroundColor = colors[i % colors.length];
      }
    }
    
    if (chartType === 'line') {
      dataset.borderColor = dataset.borderColor || dataset.backgroundColor;
      dataset.tension = 0.3;
      dataset.fill = false;
    }
    
    if (isScatter) {
      dataset.pointRadius = dataset.pointRadius || 6;
      dataset.pointHoverRadius = 8;
    }
    
    return dataset;
  });
  
  currentChartInstance = new Chart(canvas, {
    type: chartType,
    data: {
      labels: config.labels,
      datasets: datasets
    },
    options: chartOptions
  });
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
    <div class="welcome-icon" style="background: transparent;">
      <img src="logo.jpg" alt="Comau Logo" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" />
    </div>
    <h2 class="welcome-title">Good ${getTimeOfDay()}! 👋</h2>
    <p class="welcome-desc">I'm your Comau AI Assistant powered by Ollama. Ask me questions in plain English — I'll call the right API and translate results into clear, human-readable answers.</p>
    <div class="welcome-features">
      <div class="feature-card"><div class="feature-icon">🧠</div><div class="feature-text"><strong>Smart Routing</strong><span>Ollama identifies which API to call automatically</span></div></div>
      <div class="feature-card"><div class="feature-icon">🔌</div><div class="feature-text"><strong>API Powered</strong><span>Connects to your Comau backend in real time</span></div></div>
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
