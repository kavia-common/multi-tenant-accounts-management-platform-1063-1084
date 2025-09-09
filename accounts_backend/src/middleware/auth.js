'use strict';
const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/env');

/**
 * Extract tenant_id from header or JWT claims. Header takes precedence.
 * Supports 'x-tenant-id' header for explicit tenant selection.
 */
function resolveTenantId(req, decoded) {
  const headerTenant = req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'];
  if (headerTenant) return String(headerTenant);
  if (decoded && decoded.tenant_id) return String(decoded.tenant_id);
  return null;
}

/**
 * PUBLIC_INTERFACE
 * authenticateJWT
 * Express middleware: verifies JWT and attaches user + tenant to req.
 */
function authenticateJWT(req, res, next) {
  /** Validates JWT from Authorization header and sets req.user, req.tenantId. */
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: 'Missing Bearer token' });
    }
    const cfg = getConfig().jwt;
    const decoded = jwt.verify(token, cfg.secret, {
      audience: cfg.audience,
      issuer: cfg.issuer,
    });

    const tenantId = resolveTenantId(req, decoded);
    if (!tenantId) {
      return res.status(400).json({ message: 'Missing tenant identifier' });
    }

    req.user = decoded;
    req.tenantId = tenantId;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token', detail: err.message });
  }
}

/**
 * PUBLIC_INTERFACE
 * requireRoles
 * Factory to enforce role-based access control.
 * Example: router.post('/contacts', requireRoles(['Admin','Manager']), handler)
 */
function requireRoles(allowedRoles = []) {
  /** Enforces that req.user.role is one of allowedRoles. */
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      if (allowedRoles.length === 0) return next();
      const ok = allowedRoles.includes(req.user.role);
      if (!ok) return res.status(403).json({ message: 'Insufficient role' });
      next();
    } catch (e) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  };
}

module.exports = {
  // PUBLIC_INTERFACE
  authenticateJWT,
  // PUBLIC_INTERFACE
  requireRoles,
};
