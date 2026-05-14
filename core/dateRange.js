// ─────────────────────────────────────────────
// core/dateRange.js — Resolve natural date phrases
//   into timezone-aware ISO ranges for query params
// ─────────────────────────────────────────────

const { DateTime } = require('luxon');

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_RE = /^(?:last|past)\s+(\d+)\s+(hour|hours|day|days|week|weeks|month|months|year|years)$/i;
const AGO_RE = /^(\d+)\s+(hour|hours|day|days|week|weeks|month|months|year|years)\s+ago$/i;

function getRangeForToken(token, now) {
  const t = token.toLowerCase().trim();

  if (t === 'today') {
    return {
      from: now.startOf('day').toUTC().toISO(),
      to: now.endOf('day').toUTC().toISO(),
    };
  }

  if (t === 'yesterday') {
    const y = now.minus({ days: 1 });
    return {
      from: y.startOf('day').toUTC().toISO(),
      to: y.endOf('day').toUTC().toISO(),
    };
  }

  const rel = t.match(RELATIVE_RE);
  if (rel) {
    const amount = Number(rel[1]);
    const unit = rel[2].toLowerCase();

    if (!Number.isFinite(amount) || amount <= 0) return null;

    let from;
    if (unit.startsWith('hour')) {
      from = now.minus({ hours: amount });
    } else if (unit.startsWith('day')) {
      from = now.minus({ days: amount });
    } else if (unit.startsWith('week')) {
      from = now.minus({ weeks: amount });
    } else if (unit.startsWith('month')) {
      from = now.minus({ months: amount });
    } else if (unit.startsWith('year')) {
      from = now.minus({ years: amount });
    } else {
      return null;
    }

    return {
      from: from.toUTC().toISO(),
      to: now.toUTC().toISO(),
    };
  }

  const ago = t.match(AGO_RE);
  if (ago) {
    const amount = Number(ago[1]);
    const unit = ago[2].toLowerCase();

    if (!Number.isFinite(amount) || amount <= 0) return null;

    let dt;
    if (unit.startsWith('hour')) {
      dt = now.minus({ hours: amount });
    } else if (unit.startsWith('day')) {
      dt = now.minus({ days: amount });
    } else if (unit.startsWith('week')) {
      dt = now.minus({ weeks: amount });
    } else if (unit.startsWith('month')) {
      dt = now.minus({ months: amount });
    } else if (unit.startsWith('year')) {
      dt = now.minus({ years: amount });
    } else {
      return null;
    }

    return {
      from: dt.toUTC().toISO(),
      to: now.toUTC().toISO(),
    };
  }

  return null;
}

function parseSingleDateValue(rawValue, boundary, zone, now) {
  if (rawValue === undefined || rawValue === null) return rawValue;
  if (typeof rawValue !== 'string') return rawValue;

  const value = rawValue.trim();
  if (!value) return rawValue;

  const tokenRange = getRangeForToken(value, now);
  if (tokenRange) {
    return boundary === 'to' ? tokenRange.to : tokenRange.from;
  }

  if (value.toLowerCase() === 'now') {
    return now.toUTC().toISO();
  }

  if (DATE_ONLY_RE.test(value)) {
    const dt = DateTime.fromISO(value, { zone });
    return (boundary === 'to' ? dt.endOf('day') : dt.startOf('day')).toUTC().toISO();
  }

  let dt = DateTime.fromISO(value, { setZone: true });
  if (!dt.isValid) {
    dt = DateTime.fromISO(value, { zone });
  }

  if (dt.isValid) {
    return dt.toUTC().toISO();
  }

  return rawValue;
}

function resolveTemporalQueryParams(queryParams, timeZone = 'UTC') {
  if (!queryParams || typeof queryParams !== 'object') return queryParams;

  const zone = timeZone || 'UTC';
  const now = DateTime.now().setZone(zone);

  const normalized = { ...queryParams };

  const fromKey = ['from', 'start', 'startDate', 'dateFrom'].find(k => normalized[k] !== undefined);
  const toKey = ['to', 'end', 'endDate', 'dateTo'].find(k => normalized[k] !== undefined);

  if (fromKey && toKey) {
    const fromRaw = normalized[fromKey];
    const toRaw = normalized[toKey];

    if (typeof fromRaw === 'string' && typeof toRaw === 'string') {
      const sameToken = fromRaw.trim().toLowerCase() === toRaw.trim().toLowerCase();
      if (sameToken) {
        const fullRange = getRangeForToken(fromRaw, now);
        if (fullRange) {
          normalized[fromKey] = fullRange.from;
          normalized[toKey] = fullRange.to;
        }
      }
    }
  }

  if (fromKey) {
    normalized[fromKey] = parseSingleDateValue(normalized[fromKey], 'from', zone, now);
  }

  if (toKey) {
    normalized[toKey] = parseSingleDateValue(normalized[toKey], 'to', zone, now);
  }

  return normalized;
}

module.exports = { resolveTemporalQueryParams };
