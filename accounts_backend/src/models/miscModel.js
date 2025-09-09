'use strict';

const crypto = require('crypto');
const db = require('../config/db');

/**
 * Password resets:
 *  - password_resets(id PK, tenant_id, user_id, token, expires_at, used, created_at)
 * Audit logs:
 *  - audit_logs(id PK, tenant_id, user_id, action, details, created_at, ip)
 */

async function createPasswordReset(tenant_id, user_id, ttlMinutes = 30) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    'INSERT INTO password_resets(tenant_id, user_id, token, expires_at, used, created_at) VALUES(?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 0, NOW())',
    [tenant_id, user_id, token, ttlMinutes]
  );
  return token;
}

async function getPasswordReset(tenant_id, token) {
  const { rows } = await db.query(
    'SELECT * FROM password_resets WHERE tenant_id = ? AND token = ? AND used = 0 AND expires_at > NOW() LIMIT 1',
    [tenant_id, token]
  );
  return rows[0] || null;
}

async function markPasswordResetUsed(tenant_id, token) {
  await db.query(
    'UPDATE password_resets SET used = 1 WHERE tenant_id = ? AND token = ?',
    [tenant_id, token]
  );
}

async function createAuditLog(tenant_id, user_id, action, details, ip) {
  await db.query(
    'INSERT INTO audit_logs(tenant_id, user_id, action, details, created_at, ip) VALUES(?, ?, ?, ?, NOW(), ?)',
    [tenant_id, user_id || null, action, JSON.stringify(details || {}), ip || null]
  );
}

module.exports = {
  createPasswordReset,
  getPasswordReset,
  markPasswordResetUsed,
  createAuditLog,
};
