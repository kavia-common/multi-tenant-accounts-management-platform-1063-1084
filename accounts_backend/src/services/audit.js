'use strict';
const { query } = require('../db/mysql');

/**
 * PUBLIC_INTERFACE
 * logAudit
 * Creates an audit log row.
 */
async function logAudit({
  tenantId,
  userId,
  entityType,
  entityId,
  action,
  details,
}) {
  /** Insert an audit row scoped by tenant. */
  const sql = `
    INSERT INTO audit_logs
      (tenant_id, user_id, entity_type, entity_id, action, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;
  const payload = [
    tenantId,
    userId || null,
    entityType,
    entityId || null,
    action,
    JSON.stringify(details || {}),
  ];
  await query(sql, payload);
}

module.exports = {
  // PUBLIC_INTERFACE
  logAudit,
};
