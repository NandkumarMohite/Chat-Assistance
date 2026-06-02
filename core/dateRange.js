// ─────────────────────────────────────────────
// core/dateRange.js — Resolve natural date phrases
//   into timezone-aware ISO ranges for query params
// ─────────────────────────────────────────────

const { DateTime } = require('luxon');

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_RE = /^(?:last|past)\s+(\d+)\s+(hour|hours|day|days|week|weeks|month|months|year|years)$/i;
// Support "last week", "last month" without explicit number (implicitly 1)
const RELATIVE_NO_NUMBER_RE = /^(?:last|past)\s+(hour|day|week|month|year)$/i;
const AGO_RE = /^(\d+)\s+(hour|hours|day|days|week|weeks|month|months|year|years)\s+ago$/i;
// Time patterns: 11:00, 11:36, 19:58, 11:00 PM, 12:26 AM, 11.00 PM
const TIME_RE = /\d{1,2}[:.\s]\d{2}(?:\s*(?:am|pm))?/i;

// Normalize dot separators to colon (11.00 PM → 11:00 PM)
function normalizeTimeSeparator(value) {
  return value.replace(/(\d{1,2})\.(\d{2})(\s*(?:am|pm)?)/gi, '$1:$2$3');
}

// Check if a value contains a time component
function hasTimeComponent(value) {
  return TIME_RE.test(value);
}

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

  // Handle "last week", "last month", etc. without explicit number (implicitly 1)
  const relNoNum = t.match(RELATIVE_NO_NUMBER_RE);
  if (relNoNum) {
    const unit = relNoNum[1].toLowerCase();

    let from;
    if (unit === 'hour') {
      from = now.minus({ hours: 1 });
    } else if (unit === 'day') {
      from = now.minus({ days: 1 });
    } else if (unit === 'week') {
      from = now.minus({ weeks: 1 });
    } else if (unit === 'month') {
      from = now.minus({ months: 1 });
    } else if (unit === 'year') {
      from = now.minus({ years: 1 });
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

  let value = rawValue.trim();
  if (!value) return rawValue;

  // Normalize dot time separators (11.00 PM → 11:00 PM)
  value = normalizeTimeSeparator(value);
  
  // Check if the value contains a time component
  const containsTime = hasTimeComponent(value);

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

  // Try common non-ISO date formats that LLMs may output
  // If value contains time, try date+time formats first
  const fallbackFormats = containsTime ? [
    // Date + Time formats (24hr and 12hr)
    'd-M-yyyy HH:mm',      // 25-1-2026 11:00
    'dd-MM-yyyy HH:mm',    // 25-01-2026 11:00
    'd-M-yyyy h:mm a',     // 25-1-2026 11:00 PM
    'dd-MM-yyyy h:mm a',   // 25-01-2026 11:00 PM
    'd/M/yyyy HH:mm',      // 25/1/2026 11:00
    'dd/MM/yyyy HH:mm',    // 25/01/2026 11:00
    'd/M/yyyy h:mm a',     // 25/1/2026 11:00 PM
    'dd/MM/yyyy h:mm a',   // 25/01/2026 11:00 PM
    'd-MMM-yyyy HH:mm',    // 25-Jan-2026 11:00
    'dd-MMM-yyyy HH:mm',   // 25-Jan-2026 11:00
    'd-MMM-yyyy h:mm a',   // 25-Jan-2026 11:00 PM
    'dd-MMM-yyyy h:mm a',  // 25-Jan-2026 11:00 PM
    'd MMM yyyy HH:mm',    // 25 Jan 2026 11:00
    'd MMM yyyy h:mm a',   // 25 Jan 2026 11:00 PM
    'MMM d, yyyy HH:mm',   // Jan 25, 2026 11:00
    'MMM d, yyyy h:mm a',  // Jan 25, 2026 11:00 PM
    'yyyy-MM-dd HH:mm',    // 2026-01-25 11:00
    'yyyy-MM-dd h:mm a',   // 2026-01-25 11:00 PM
    // Time-only formats (will apply to today's date)
    'HH:mm',               // 11:00, 19:58
    'h:mm a',              // 11:00 PM, 12:26 AM
  ] : [
    'd-MMM-yyyy',      // 1-Mar-2026
    'dd-MMM-yyyy',     // 01-Mar-2026
    'd-MMM-yy',        // 1-Mar-26
    'dd-MMM-yy',       // 01-Mar-26
    'MMM d, yyyy',     // Mar 1, 2026
    'MMMM d, yyyy',    // March 1, 2026
    'd MMMM yyyy',     // 1 March 2026
    'd MMM yyyy',      // 1 Mar 2026
    'dd/MM/yyyy',      // 01/03/2026
    'MM/dd/yyyy',      // 03/01/2026
    'yyyy/MM/dd',      // 2026/03/01
    'd/M/yyyy',        // 1/3/2026
    'M/d/yyyy',        // 3/1/2026
    'd-M-yyyy',        // 1-3-2026
    'dd-MM-yyyy',      // 01-03-2026
  ];

  for (const fmt of fallbackFormats) {
    const parsed = DateTime.fromFormat(value, fmt, { zone });
    if (parsed.isValid) {
      // If it's a time-only format (HH:mm or h:mm a), apply to today's date
      if (fmt === 'HH:mm' || fmt === 'h:mm a') {
        const todayWithTime = now.set({ 
          hour: parsed.hour, 
          minute: parsed.minute, 
          second: 0, 
          millisecond: 0 
        });
        return todayWithTime.toUTC().toISO();
      }
      // If value contains time, preserve the exact time
      if (containsTime) {
        return parsed.toUTC().toISO();
      }
      // Date-only: apply start/end of day based on boundary
      return (boundary === 'to' ? parsed.endOf('day') : parsed.startOf('day')).toUTC().toISO();
    }
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

  // SINGLE DATE → FULL DAY RANGE: If only startDate is provided without endDate,
  // and it looks like a specific date (not a relative range), auto-fill endDate to same date.
  if (fromKey && !toKey) {
    const fromRaw = normalized[fromKey];
    if (typeof fromRaw === 'string') {
      const val = fromRaw.trim().toLowerCase();
      // Check if it's NOT a relative token (last X, past X, X ago, today, yesterday, now)
      const isRelative = RELATIVE_RE.test(val) || RELATIVE_NO_NUMBER_RE.test(val) || AGO_RE.test(val)
        || val === 'today' || val === 'yesterday' || val === 'now';
      if (!isRelative) {
        // Determine the matching "to" key name based on the "from" key name
        const toKeyName = fromKey === 'from' ? 'to'
          : fromKey === 'start' ? 'end'
          : fromKey === 'startDate' ? 'endDate'
          : 'dateTo';
        normalized[toKeyName] = fromRaw;
      }
    }
  }

  // Re-detect keys after possible auto-fill
  const resolvedFromKey = ['from', 'start', 'startDate', 'dateFrom'].find(k => normalized[k] !== undefined);
  const resolvedToKey = ['to', 'end', 'endDate', 'dateTo'].find(k => normalized[k] !== undefined);

  if (resolvedFromKey && resolvedToKey) {
    const fromRaw = normalized[resolvedFromKey];
    const toRaw = normalized[resolvedToKey];

    if (typeof fromRaw === 'string' && typeof toRaw === 'string') {
      const sameToken = fromRaw.trim().toLowerCase() === toRaw.trim().toLowerCase();
      if (sameToken) {
        const fullRange = getRangeForToken(fromRaw, now);
        if (fullRange) {
          normalized[resolvedFromKey] = fullRange.from;
          normalized[resolvedToKey] = fullRange.to;
        }
      }
    }
  }

  if (resolvedFromKey) {
    normalized[resolvedFromKey] = parseSingleDateValue(normalized[resolvedFromKey], 'from', zone, now);
  }

  if (resolvedToKey) {
    normalized[resolvedToKey] = parseSingleDateValue(normalized[resolvedToKey], 'to', zone, now);
  }

  return normalized;
}

/**
 * Calculate the previous period for period-over-period comparison.
 * Given a date range (from, to), returns the equivalent previous period.
 * 
 * Example:
 *   Input: from=2026-05-01, to=2026-05-15 (15 days)
 *   Output: from=2026-04-16, to=2026-05-01 (same 15 days, shifted back)
 * 
 * @param {string} fromISO - ISO date string for start of current period
 * @param {string} toISO - ISO date string for end of current period
 * @param {string} zone - Timezone (default: UTC)
 * @returns {object} { from, to, duration } - Previous period dates + duration info
 */
function calculatePreviousPeriod(fromISO, toISO, zone = 'UTC') {
  if (!fromISO || !toISO) {
    throw new Error('Both from and to dates are required for period comparison');
  }

  const fromDt = DateTime.fromISO(fromISO, { zone });
  const toDt = DateTime.fromISO(toISO, { zone });

  if (!fromDt.isValid || !toDt.isValid) {
    throw new Error(`Invalid date format: from=${fromISO}, to=${toISO}`);
  }

  // Calculate duration in milliseconds
  const durationMs = toDt.toMillis() - fromDt.toMillis();
  
  if (durationMs <= 0) {
    throw new Error('End date must be after start date');
  }

  // Calculate previous period: shift both dates back by the duration
  const prevFrom = fromDt.minus({ milliseconds: durationMs });
  const prevTo = fromDt; // Previous period ends where current period starts

  // Calculate human-readable duration
  const diff = toDt.diff(fromDt, ['days', 'hours']).toObject();
  let durationStr;
  if (diff.days >= 1) {
    durationStr = `${Math.round(diff.days)} day${Math.round(diff.days) !== 1 ? 's' : ''}`;
  } else {
    durationStr = `${Math.round(diff.hours || 0)} hour${Math.round(diff.hours || 0) !== 1 ? 's' : ''}`;
  }

  return {
    from: prevFrom.toUTC().toISO(),
    to: prevTo.toUTC().toISO(),
    duration: durationStr,
    durationMs
  };
}

module.exports = { resolveTemporalQueryParams, calculatePreviousPeriod };
