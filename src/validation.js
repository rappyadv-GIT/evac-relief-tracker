const { badRequest } = require('./errors');

/**
 * Tiny schema validator. A schema is an object of field -> rules:
 *   { type: 'string'|'int'|'date', required, min, max, maxLength, pattern, oneOf, trim }
 * Returns a clean object, or throws 400 with every problem listed.
 */
function validate(body, schema, { partial = false } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = [];
  const clean = {};

  for (const [field, rules] of Object.entries(schema)) {
    let value = input[field];
    const missing = value === undefined || value === null || value === '';

    if (missing) {
      if (rules.required && !partial) errors.push(`${field} is required`);
      else if (!partial && rules.default !== undefined) clean[field] = rules.default;
      else if (!partial && !rules.required) clean[field] = null;
      continue;
    }

    if (rules.type === 'string') {
      if (typeof value !== 'string') { errors.push(`${field} must be text`); continue; }
      value = value.trim().replace(/\s+/g, ' ');
      if (value === '' && rules.required) { errors.push(`${field} is required`); continue; }
      if (rules.maxLength && value.length > rules.maxLength) errors.push(`${field} must be at most ${rules.maxLength} characters`);
      if (rules.pattern && !rules.pattern.test(value)) errors.push(rules.patternMessage || `${field} has an invalid format`);
      if (rules.oneOf && !rules.oneOf.includes(value)) errors.push(`${field} must be one of: ${rules.oneOf.join(', ')}`);
    } else if (rules.type === 'int') {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (!Number.isInteger(n)) { errors.push(`${field} must be a whole number`); continue; }
      if (rules.min !== undefined && n < rules.min) errors.push(`${field} must be at least ${rules.min}`);
      if (rules.max !== undefined && n > rules.max) errors.push(`${field} must be at most ${rules.max}`);
      value = n;
    } else if (rules.type === 'date') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        errors.push(`${field} must be a date in YYYY-MM-DD format`);
        continue;
      }
    }
    clean[field] = value;
  }

  if (errors.length > 0) throw badRequest('Validation failed', errors);
  return clean;
}

/** Validates an :id route parameter. */
function parseId(raw, label = 'id') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw badRequest(`${label} must be a positive whole number`);
  return id;
}

/** Today's date in the Philippines (YYYY-MM-DD), so the "one pack per day" rule follows local days. */
function todayInManila(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

const PH_MOBILE = /^(09\d{9}|\+639\d{9})$/;

module.exports = { validate, parseId, todayInManila, PH_MOBILE };

/** Normalizes a DATE column value (string or Date) to 'YYYY-MM-DD'. */
function toDateString(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? value : String(value).slice(0, 10);
}

module.exports.toDateString = toDateString;
