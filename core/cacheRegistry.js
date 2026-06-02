// ─────────────────────────────────────────────
// core/cacheRegistry.js — Load and refresh cacheable APIs
// ─────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const CACHE_REGISTRY_PATH = path.join(__dirname, '..', 'api-registry-cache-api.json');

let CACHE_REGISTRY = null;
let refreshTimer = null;
let isRefreshing = false;

// In-memory cache store: cacheKey -> array of entries
const CACHE_STORE = new Map();

function loadCacheRegistry() {
  const raw = fs.readFileSync(CACHE_REGISTRY_PATH, 'utf-8');
  CACHE_REGISTRY = JSON.parse(raw);

  if (process.env.BACKEND_URL) {
    CACHE_REGISTRY.baseUrl = process.env.BACKEND_URL;
  }

  const apiCount = CACHE_REGISTRY.apis ? CACHE_REGISTRY.apis.length : 0;
  console.log(`✅ Loaded cache API registry: ${apiCount} endpoints from ${CACHE_REGISTRY.serviceName}`);
  return CACHE_REGISTRY;
}

function getCacheRegistry() {
  return CACHE_REGISTRY;
}

function getCacheStore() {
  return CACHE_STORE;
}

function isEntryFresh(entry) {
  if (!entry || !entry.fetchedAt) return false;
  const ttlMs = entry.ttlMs || 0;
  if (ttlMs <= 0) return false;
  const ageMs = Date.now() - new Date(entry.fetchedAt).getTime();
  return ageMs <= ttlMs;
}

function getCachedResponse(apiId, url = null) {
  if (!CACHE_REGISTRY || !Array.isArray(CACHE_REGISTRY.apis)) return null;
  const apiDef = CACHE_REGISTRY.apis.find(a => a.id === apiId);
  if (!apiDef) return null;

  const cacheKey = apiDef.cacheKey || apiDef.id;
  const entries = CACHE_STORE.get(cacheKey) || [];
  if (entries.length === 0) return null;

  const freshEntries = entries.filter(e => e.ok && isEntryFresh(e));
  if (freshEntries.length === 0) return null;

  if (url) {
    const match = freshEntries.find(e => e.url === url);
    if (match) return match;
  }

  return freshEntries[0];
}

function normalizeUrl(rawUrl, baseUrl) {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return rawUrl;
  if (rawUrl.includes('baseURL')) return rawUrl.replace('baseURL', baseUrl);
  if (rawUrl.startsWith('/')) return `${baseUrl}${rawUrl}`;
  return `${baseUrl}/${rawUrl}`;
}

function buildUrlsForApi(api, baseUrl) {
  if (Array.isArray(api.possible_API_structure) && api.possible_API_structure.length > 0) {
    return api.possible_API_structure
      .map(entry => normalizeUrl(entry.URL, baseUrl))
      .filter(Boolean);
  }

  if (api.path && api.path.includes('{')) {
    return [];
  }

  return api.path ? [normalizeUrl(api.path, baseUrl)] : [];
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

function upsertCacheEntry(cacheKey, entry) {
  const existing = CACHE_STORE.get(cacheKey) || [];
  existing.push(entry);
  CACHE_STORE.set(cacheKey, existing);
}

function clearCacheKey(cacheKey) {
  CACHE_STORE.delete(cacheKey);
}

async function refreshCache() {
  if (isRefreshing) return;
  if (!CACHE_REGISTRY) loadCacheRegistry();

  const { baseUrl, cacheConfig, apis } = CACHE_REGISTRY;
  if (!Array.isArray(apis) || apis.length === 0) return;

  isRefreshing = true;
  const ttlMs = (cacheConfig && cacheConfig.defaultTTL) || 900000;
  const timeoutMs = 15000;

  try {
    const tasks = [];

    for (const api of apis) {
      const urls = buildUrlsForApi(api, baseUrl);
      if (urls.length === 0) {
        console.warn(`⚠️ Skipping cache refresh for ${api.id}: no callable URL available.`);
        continue;
      }

      clearCacheKey(api.cacheKey || api.id);

      for (const url of urls) {
        tasks.push(
          fetchWithTimeout(url, timeoutMs)
            .then(result => {
              upsertCacheEntry(api.cacheKey || api.id, {
                apiId: api.id,
                url,
                fetchedAt: new Date().toISOString(),
                ttlMs: api.cacheTTL || ttlMs,
                ok: result.ok,
                status: result.status,
                data: result.data
              });
            })
            .catch(err => {
              upsertCacheEntry(api.cacheKey || api.id, {
                apiId: api.id,
                url,
                fetchedAt: new Date().toISOString(),
                ttlMs: api.cacheTTL || ttlMs,
                ok: false,
                status: null,
                error: err.message
              });
            })
        );
      }
    }

    await Promise.all(tasks);
    console.log(`✅ Cache refresh complete: ${CACHE_STORE.size} keys updated`);
  } finally {
    isRefreshing = false;
  }
}

function startCacheScheduler() {
  if (!CACHE_REGISTRY) loadCacheRegistry();
  const { cacheConfig } = CACHE_REGISTRY;

  if (!cacheConfig || cacheConfig.enableAutoRefresh !== true) {
    return;
  }

  const intervalMs = (cacheConfig.refreshIntervalMinutes || 15) * 60 * 1000;

  if (cacheConfig.refreshOnStartup) {
    refreshCache();
  }

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshCache, intervalMs);
  console.log(`⏱️ Cache auto-refresh enabled: every ${cacheConfig.refreshIntervalMinutes || 15} minutes`);
}

module.exports = {
  loadCacheRegistry,
  getCacheRegistry,
  getCacheStore,
  getCachedResponse,
  refreshCache,
  startCacheScheduler
};
