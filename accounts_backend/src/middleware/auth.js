'use strict';

const { verifyAccessToken, hasRole } = require('../utils/jwt');

/**
 * Extract bearer token from Authorization header.
 */
function extractToken(req) {
  const auth = req.headers['authorization'] || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7);
}

/**
 * PUBLIC_INTERFACE
 * Express middleware to authenticate requests using JWT access token.
 * Populates req.user = { user_id, tenant_id, role, email, name }
 */
function authenticate(req, res, next) {
  /** Authenticate request and populate req.user from JWT */
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: 'Missing bearer token' });
    const decoded = verifyAccessToken(token);
    // tenant scoping and basic user info
    req.user = {
      user_id: decoded.user_id,
      tenant_id: decoded.tenant_id,
      role: decoded.role,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * PUBLIC_INTERFACE
 * Require the given minimum role.
 * @param {'viewer'|'sales_rep'|'manager'|'admin'} role
 */
function requireRole(role) {
  /** Enforce minimum role requirement. */
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'Unauthenticated' });
    if (!hasRole(req.user.role, role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
}

/**
 * PUBLIC_INTERFACE
 * Tenant enforcement: ensure a tenant_id is set and optionally matches a param or body.
 * By default, ensures req.user.tenant_id exists.
 */
function requireTenant(req, res, next) {
  /** Enforce tenant presence on request */
  if (!req.user || !req.user.tenant_id) {
    return res.status(400).json({ message: 'Tenant context missing' });
  }
  next();
}

module.exports = {
  authenticate,
  requireRole,
  requireTenant,
};
