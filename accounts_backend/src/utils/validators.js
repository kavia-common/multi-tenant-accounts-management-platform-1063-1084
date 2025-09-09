'use strict';

/**
 * PUBLIC_INTERFACE
 * sanitizeLike
 * Escapes % and _ for SQL LIKE queries.
 */
function sanitizeLike(str) {
  /** Escape % and _ to prevent wildcard abuse. */
  if (str == null) return '';
  return String(str).replace(/[%_]/g, c => '\\' + c);
}

/**
 * PUBLIC_INTERFACE
 * parsePagination
 * Extracts limit/offset safely from query params.
 */
function parsePagination(query) {
  /** Return {limit, offset} with sane defaults and bounds. */
  const limit = Math.min(Math.max(parseInt(query.limit || '25', 10) || 25, 1), 200);
  const page = Math.max(parseInt(query.page || '1', 10) || 1, 1);
  const offset = (page - 1) * limit;
  return { limit, offset, page };
}

/**
 * PUBLIC_INTERFACE
 * parseSort
 * Builds ORDER BY with whitelist of columns and directions.
 */
function parseSort(query, allowed = []) {
  /** Return { orderBySql, params } for ORDER BY */
  const sort = (query.sort || '').split(',').map(s => s.trim()).filter(Boolean);
  if (sort.length === 0) return '';
  const parts = [];
  for (const s of sort) {
    const desc = s.startsWith('-');
    const col = desc ? s.slice(1) : s;
    if (!allowed.includes(col)) continue;
    parts.push(`${col} ${desc ? 'DESC' : 'ASC'}`);
  }
  return parts.length ? ' ORDER BY ' + parts.join(', ') : '';
}

module.exports = {
  // PUBLIC_INTERFACE
  sanitizeLike,
  // PUBLIC_INTERFACE
  parsePagination,
  // PUBLIC_INTERFACE
  parseSort,
};
