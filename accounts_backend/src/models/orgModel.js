'use strict';

const db = require('../config/db');

/**
 * Organizations model: multi-tenant isolation using tenant_id equals organization id of the tenant.
 * Expected schema:
 *  - organizations(id PK, name, created_at, updated_at)
 */

async function createOrg({ name }) {
  const { rows } = await db.query(
    'INSERT INTO organizations(name, created_at, updated_at) VALUES(?, NOW(), NOW())',
    [name]
  );
  const { rows: created } = await db.query(
    'SELECT id, name, created_at, updated_at FROM organizations WHERE name = ? ORDER BY id DESC LIMIT 1',
    [name]
  );
  return created[0] || null;
}

async function listOrgs() {
  const { rows } = await db.query(
    'SELECT id, name, created_at, updated_at FROM organizations ORDER BY created_at DESC',
    []
  );
  return rows;
}

async function getOrg(id) {
  const { rows } = await db.query(
    'SELECT id, name, created_at, updated_at FROM organizations WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function updateOrg(id, { name }) {
  await db.query('UPDATE organizations SET name = ?, updated_at = NOW() WHERE id = ?', [name, id]);
  return getOrg(id);
}

async function deleteOrg(id) {
  // Note: cascading delete constraints should be managed at DB level. Here we soft-check.
  await db.query('DELETE FROM organizations WHERE id = ?', [id]);
  return true;
}

module.exports = {
  createOrg,
  listOrgs,
  getOrg,
  updateOrg,
  deleteOrg,
};
