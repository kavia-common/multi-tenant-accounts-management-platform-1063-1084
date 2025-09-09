'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_EXP = '1h';
const REFRESH_EXP = '7d';

/**
 * PUBLIC_INTERFACE
 * Issue an access token JWT.
 * @param {object} payload - Must include user_id, tenant_id, role
 * @param {string} [expiresIn] - expiration window like '1h'
 * @returns {string} JWT token
 */
function issueAccessToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || DEFAULT_EXP) {
  /** Issue a signed JWT access token. */
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * PUBLIC_INTERFACE
 * Issue a refresh token JWT.
 * @param {object} payload - Must include user_id, tenant_id
 * @returns {string} JWT refresh token
 */
function issueRefreshToken(payload) {
  /** Issue a signed JWT refresh token. */
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET or JWT_SECRET not set');
  return jwt.sign(payload, secret, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || REFRESH_EXP });
}

/**
 * Verify access token.
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.verify(token, secret);
}

/**
 * Verify refresh token.
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyRefreshToken(token) {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET or JWT_SECRET not set');
  return jwt.verify(token, secret);
}

/**
 * PUBLIC_INTERFACE
 * Role hierarchy utility.
 * Higher index means higher privilege.
 */
const ROLES = ['viewer', 'sales_rep', 'manager', 'admin'];

/**
 * PUBLIC_INTERFACE
 * Check if the userRole has at least requiredRole permissions.
 * @param {('viewer'|'sales_rep'|'manager'|'admin')} userRole
 * @param {('viewer'|'sales_rep'|'manager'|'admin')} requiredRole
 * @returns {boolean}
 */
function hasRole(userRole, requiredRole) {
  /** Checks role hierarchy. */
  const a = ROLES.indexOf(String(userRole || '').toLowerCase());
  const b = ROLES.indexOf(String(requiredRole || '').toLowerCase());
  return a >= 0 && b >= 0 && a >= b;
}

module.exports = {
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hasRole,
  ROLES,
};
