// ─────────────────────────────────────────────
// core/entityResolver.js
// Resolves entity names/codes to IDs using the in-memory cache store.
// Handles: station name → stationId, line name → lineId, alarm code → alarmId
// Also enriches API responses by mapping IDs back to names.
// ─────────────────────────────────────────────

const { getCacheStore } = require('./cacheRegistry');

// ── Levenshtein distance for fuzzy matching ─────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1);
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarityScore(a, b) {
  if (!a || !b) return 0;
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1.0;
  // Only treat substring inclusion as a high score when the shorter string is
  // at least 60% the length of the longer one — prevents "1" inside "M_1" from
  // scoring 0.88 (which would cause false auto-resolves).
  const shorter = al.length <= bl.length ? al : bl;
  const longer  = al.length <= bl.length ? bl : al;
  if (longer.includes(shorter) && shorter.length >= longer.length * 0.6) return 0.88;
  const maxLen = Math.max(al.length, bl.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(al, bl) / maxLen;
}

// ── Entity type configuration ─────────────────────────────────
// Maps entity type name to: which cache key to look in, and which fields contain id/name
const ENTITY_CONFIG = {
  station: {
    cacheKey: 'stations',
    idField: 'id',
    nameFields: ['name', 'stationNumber'],
    label: 'station'
  },
  all_virtual_device: {
    cacheKey: 'all_virtual_devices',
    idField: 'id',
    nameFields: ['name', 'uniqueIdOnCollector'],
    label: 'virtual device'
  },
  station_link: {
    cacheKey: 'station_links',
    idField: 'id',
    nameFields: ['fromStationName', 'toStationName'],
    label: 'station link'
  },
  station_link_buffer: {
    cacheKey: 'station_link_buffer',
    idField: 'id',
    nameFields: ['bufferName'],
    label: 'station link buffer'
  },
  station_alarm: {
    cacheKey: 'station_alarms',
    idField: 'id',
    nameFields: ['stationName', 'alarmId'],
    label: 'station alarm'
  },
  line: {
    cacheKey: 'lines',
    idField: 'id',
    nameFields: ['name'],
    label: 'line'
  },
  all_line_link: {
    cacheKey: 'all_line_links',
    idField: 'id',
    nameFields: ['fromLineName', 'toLineName'],
    label: 'line link'
  },
  all_line_buffer: {
    cacheKey: 'all_line_buffer',
    idField: 'id',
    nameFields: ['bufferName'],
    label: 'line buffer'
  },
  all_energy_meter: {
    cacheKey: 'all_energy_meters',
    idField: 'id',
    nameFields: ['energyMeterName'],
    label: 'energy meter'
  },
  alarm: {
    cacheKey: 'alarms',
    idField: 'id',
    nameFields: ['code'],
    label: 'alarm'
  },
  // Models are not cached — pass the user-supplied string straight through to the API.
  model: {
    passThrough: true,
    label: 'model'
  }
};

// ── Maps API parameter names to entity types ──────────────────
// If a param's value is non-numeric, we try to resolve it via cache
const PARAM_ENTITY_MAP = {
  stationId:  'station',
  stationIds: 'station',   // comma-separated list
  lineId:     'line',
  lineIds:    'line',      // comma-separated list
  alarmId:    'alarm',
  virtualDeviceId: 'all_virtual_device',
  virtualDeviceIds: 'all_virtual_device',
  stationLinkId: 'station_link',
  stationLinkBufferId: 'station_link_buffer',
  stationAlarmId: 'station_alarm',
  lineLinkId: 'all_line_link',
  lineBufferId: 'all_line_buffer',
  energyMeterId: 'all_energy_meter',
  modelId:    'model',
  models:     'model',
  model:      'model'
};

// ── Maps "name-type" params → { entity type, target ID param } ──
// When the LLM emits stationName/lineName instead of stationId/lineId,
// we resolve the name to an ID and rewrite the param key automatically.
const NAME_PARAM_TO_ID_MAP = {
  stationName:     { entityType: 'station', idParam: 'stationId' },
  stationNumber:   { entityType: 'station', idParam: 'stationId' },
  lineName:        { entityType: 'line',    idParam: 'lineId' },
  alarmCode:       { entityType: 'alarm',   idParam: 'alarmId' },
  alarmName:       { entityType: 'alarm',   idParam: 'alarmId' },
  virtualDeviceName: { entityType: 'all_virtual_device', idParam: 'virtualDeviceId' },
  uniqueIdOnCollector: { entityType: 'all_virtual_device', idParam: 'virtualDeviceId' },
  stationLinkName: { entityType: 'station_link', idParam: 'stationLinkId' },
  bufferName: { entityType: 'station_link_buffer', idParam: 'stationLinkBufferId' },
  stationAlarmName: { entityType: 'station_alarm', idParam: 'stationAlarmId' },
  lineLinkName: { entityType: 'all_line_link', idParam: 'lineLinkId' },
  lineBufferName: { entityType: 'all_line_buffer', idParam: 'lineBufferId' },
  energyMeterName: { entityType: 'all_energy_meter', idParam: 'energyMeterId' },
  modelName: { entityType: 'model', idParam: 'models' },
  model:     { entityType: 'model', idParam: 'models' }
};

// ── Maps API response fields (ID fields) to entity types for enrichment ──
const RESPONSE_ENRICH_MAP = {
  stationId:     { type: 'station', nameKey: 'stationName' },
  fromStationId: { type: 'station', nameKey: 'fromStationName' },
  toStationId:   { type: 'station', nameKey: 'toStationName' },
  lineId:        { type: 'line',    nameKey: 'lineName' },
  fromLineId:    { type: 'line',    nameKey: 'fromLineName' },
  toLineId:      { type: 'line',    nameKey: 'toLineName' }
};

// ── Get all cached items for an entity type ───────────────────
function getCachedEntities(entityType) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) return [];

  const store = getCacheStore();
  const entries = store.get(config.cacheKey) || [];

  const data = [];
  for (const entry of entries) {
    if (!entry.ok) continue;
    if (Array.isArray(entry.data)) {
      data.push(...entry.data);
    } else if (entry.data && typeof entry.data === 'object') {
      data.push(entry.data);
    }
  }

  // Deduplicate by idField
  const seen = new Set();
  return data.filter(item => {
    const id = item[config.idField];
    if (id === undefined || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// ── Build a display name for an entity from config ────────────
function entityDisplayName(entity, config) {
  return config.nameFields
    .map(f => entity[f])
    .filter(v => v !== undefined && v !== null && v !== '')
    .join(' / ');
}

// ── Resolve a single name/value to an entity ─────────────────
// Returns:
//   { id, name, confidence }                   — resolved
//   { id, isNumericId: true }                  — already a numeric ID, passed through
//   { id: null, cacheEmpty: true }             — cache not loaded yet
//   { id: null, notFound: true }               — no match at all
//   { id: null, needsClarification, suggestions, query, entityType } — ambiguous
//
// options.confirmed = true  → the user explicitly chose this name from a suggestion list;
//   use a lower threshold (0.5) so we never re-ask for an entity the user already confirmed.
function resolveEntity(value, entityType, options = {}) {
  const { confirmed = false } = options;
  const config = ENTITY_CONFIG[entityType];
  if (!config) return { id: value, confidence: 0, notResolved: true };

  const strVal = String(value).trim();

  // Pass-through entities (e.g. model) — no cache lookup, send string straight to API
  if (config.passThrough) {
    console.log(`[ENTITY RESOLVER] "${strVal}" → ${config.label} (pass-through, no resolution)`);
    return { id: strVal, name: strVal, confidence: 1, passThrough: true };
  }

  // Already a numeric ID — pass through unchanged
  if (/^\d+$/.test(strVal)) {
    return { id: parseInt(strVal, 10), confidence: 1, isNumericId: true };
  }

  const entities = getCachedEntities(entityType);

  if (entities.length === 0) {
    console.warn(`[ENTITY RESOLVER] Cache for "${config.cacheKey}" is empty — cannot resolve "${strVal}"`);
    return { id: null, confidence: 0, cacheEmpty: true, query: strVal };
  }

  // Score every entity across all name fields
  const scored = [];
  for (const entity of entities) {
    let best = 0;
    for (const field of config.nameFields) {
      const fieldVal = String(entity[field] ?? '');
      if (!fieldVal) continue;
      const score = similarityScore(strVal, fieldVal);
      if (score > best) best = score;
    }
    if (best >= 0.2) scored.push({ entity, score: best });  // 0.2 floor keeps more candidates as suggestions
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // No candidate at all — tell the user instead of silently passing the raw string to the API
    return { id: null, confidence: 0, notFound: true, query: strVal, entityType, label: config.label, suggestions: [] };
  }

  const top = scored[0];

  // Auto-resolve threshold:
  //   confirmed=true  → 0.5 (user already chose this from the suggestion list — trust it)
  //   confirmed=false → 0.95 (strict: only exact / near-exact matches auto-resolve)
  const autoThreshold = confirmed ? 0.5 : 0.95;

  if (top.score >= autoThreshold) {
    const name = entityDisplayName(top.entity, config);
    const tag  = confirmed ? 'confirmed by user' : 'auto-resolved';
    console.log(`[ENTITY RESOLVER] "${strVal}" → ${config.label} ID ${top.entity[config.idField]} "${name}" [${(top.score * 100).toFixed(0)}% — ${tag}]`);
    return { id: top.entity[config.idField], name, confidence: top.score };
  }

  // Ambiguous / medium-confidence — ask the user for clarification
  const suggestions = scored.slice(0, 6).map(s => ({
    id: s.entity[config.idField],
    name: entityDisplayName(s.entity, config),
    score: s.score
  }));

  return {
    id: null,
    needsClarification: true,
    query: strVal,
    entityType,
    label: config.label,
    suggestions
  };
}

// ── Resolve all entity params in a call ──────────────────────
// Mutates copies of pathParams + queryParams, replacing name strings with resolved IDs.
// Returns:
//   {
//     resolvedPathParams,
//     resolvedQueryParams,
//     clarifications: []   — non-empty when at least one param is ambiguous
//   }
// options.confirmedNames — array of entity name strings the user explicitly confirmed;
//   those names bypass the strict 0.95 threshold and resolve at 0.5.
function resolveCallParams(pathParams = {}, queryParams = {}, options = {}) {
  const confirmedLower = (options.confirmedNames || []).map(n => String(n).toLowerCase().trim());
  const resolvedPath  = { ...pathParams };
  const resolvedQuery = { ...queryParams };
  const clarifications = [];

  function processParam(source, paramName) {
    const rawValue = source[paramName];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    const entityType = PARAM_ENTITY_MAP[paramName];
    if (!entityType) return;

    const isConfirmed = confirmedLower.includes(String(rawValue).toLowerCase().trim());

    // Handle comma-separated lists (stationIds, lineIds)
    if (paramName === 'stationIds' || paramName === 'lineIds') {
      const parts = String(rawValue).split(',').map(s => s.trim()).filter(Boolean);
      const resolved = [];
      for (const part of parts) {
        const partConfirmed = confirmedLower.includes(part.toLowerCase().trim());
        const result = resolveEntity(part, entityType, { confirmed: partConfirmed });
        if (result.needsClarification || result.notFound) {
          clarifications.push({ paramName, ...result });
        } else if (result.id !== null) {
          resolved.push(String(result.id));
        } else {
          resolved.push(part); // cache empty or not found — pass through
        }
      }
      source[paramName] = resolved.join(',');
      return;
    }

    // Single value
    if (/^\d+$/.test(String(rawValue))) return; // already a numeric ID

    const result = resolveEntity(rawValue, entityType, { confirmed: isConfirmed });
    if (result.needsClarification || result.notFound) {
      // notFound  → no candidate at all  (show ❌ message)
      // needsClarification → ambiguous    (show suggestion list)
      clarifications.push({ paramName, ...result });
    } else if (result.id !== null) {
      source[paramName] = result.id;
    }
    // else: cacheEmpty — cache not loaded yet, pass value through and let the API handle it
  }

  for (const key of Object.keys(resolvedPath))  processParam(resolvedPath,  key);
  for (const key of Object.keys(resolvedQuery)) processParam(resolvedQuery, key);

  // ── Handle name-type params (stationName, lineName, etc.) ──────────────
  // If the LLM emitted e.g. stationName="M_1", resolve it and write stationId=<id>
  function processNameParam(source, paramName) {
    const cfg = NAME_PARAM_TO_ID_MAP[paramName];
    if (!cfg) return;

    const rawValue = source[paramName];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    console.log(`[ENTITY RESOLVER] Name param "${paramName}=${rawValue}" → resolving as ${cfg.entityType}, target param: ${cfg.idParam}`);

    const nameConfirmed = confirmedLower.includes(String(rawValue).toLowerCase().trim());
    const result = resolveEntity(rawValue, cfg.entityType, { confirmed: nameConfirmed });

    if (result.needsClarification || result.notFound) {
      clarifications.push({ paramName: cfg.idParam, ...result });
      delete source[paramName];
    } else if (result.id !== null) {
      // Write resolved ID under the correct param key, remove the name param
      source[cfg.idParam] = result.id;
      delete source[paramName];
      console.log(`[ENTITY RESOLVER] "${rawValue}" → ${cfg.idParam}=${result.id} (replaced ${paramName})`);
    } else {
      // cacheEmpty — cache not loaded yet; pass the name through as the ID param value
      console.warn(`[ENTITY RESOLVER] Cache empty for "${rawValue}" (${paramName}) — passing through`);
      source[cfg.idParam] = rawValue;
      delete source[paramName];
    }
  }

  for (const key of Object.keys(resolvedPath))  processNameParam(resolvedPath,  key);
  for (const key of Object.keys(resolvedQuery)) processNameParam(resolvedQuery, key);

  return { resolvedPathParams: resolvedPath, resolvedQueryParams: resolvedQuery, clarifications };
}

// ── Build a human-readable clarification message ─────────────
function buildClarificationMessage(clarifications) {
  if (!clarifications || clarifications.length === 0) return null;

  const lines = [];
  lines.push(`I couldn't find an exact match for the ${clarifications.map(c => c.label || c.entityType).join(' / ')} you mentioned. Here are the closest matches I found:\n`);

  for (const c of clarifications) {
    const label = c.label || c.entityType;
    if (!c.suggestions || c.suggestions.length === 0) {
      lines.push(`❌ No ${label} found matching **"${c.query}"** in the system. Please check the name and try again.`);
      continue;
    }

    lines.push(`🔍 **"${c.query}"** — did you mean one of these ${label}s?`);
    for (let i = 0; i < c.suggestions.length; i++) {
      const s = c.suggestions[i];
      lines.push(`  ${i + 1}. **${s.name}** (ID: ${s.id})`);
    }
    lines.push(`\nPlease reply using the exact name or ID (e.g. *"give me data for ${c.suggestions[0]?.name}"*) to continue.`);
  }

  return lines.join('\n');
}

// ── Enrich API response: add name fields for ID-only fields ──
// E.g. adds stationName when only stationId is present in a row
function enrichResponseWithNames(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  // Pre-build lookup maps { id → displayName } for each entity type needed
  const lookups = {};
  for (const [, cfg] of Object.entries(RESPONSE_ENRICH_MAP)) {
    if (lookups[cfg.type]) continue;
    const entityCfg = ENTITY_CONFIG[cfg.type];
    if (!entityCfg) continue;

    const entities = getCachedEntities(cfg.type);
    const map = {};
    for (const e of entities) {
      map[e[entityCfg.idField]] = entityDisplayName(e, entityCfg);
    }
    lookups[cfg.type] = map;
  }

  return rows.map(row => {
    if (!row || typeof row !== 'object') return row;
    const enriched = { ...row };

    for (const [idField, cfg] of Object.entries(RESPONSE_ENRICH_MAP)) {
      const id = row[idField];
      if (id === undefined || id === null) continue;
      if (row[cfg.nameKey]) continue; // already has the name field

      const name = lookups[cfg.type]?.[id];
      if (name) enriched[cfg.nameKey] = name;
    }

    return enriched;
  });
}

module.exports = {
  resolveEntity,
  resolveCallParams,
  buildClarificationMessage,
  enrichResponseWithNames,
  getCachedEntities
};
