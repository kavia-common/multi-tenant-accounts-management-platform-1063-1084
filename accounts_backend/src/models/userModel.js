'use strict';

const db = require('../config/db');

/**
 * Users model: multi-tenant table with tenant_id column.
 * Expected schema:
 *  - users(id PK, tenant_id, email UNIQUE(tenant_id,email), name, password_hash, status, created_at, updated_at)
 *  - roles(id PK, name) where name in ['admin','manager','sales_rep','viewer']
 *  - user_roles(user_id, tenant_id, role_name)
 */

async function findByEmail(tenant_id, email) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE tenant_id = ? AND email = ? LIMIT 1',
    [tenant_id, email]
  );
  return rows[0] || null;
}

async function findById(tenant_id, id) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE tenant_id = ? AND id = ? LIMIT 1',
    [tenant_id, id]
  );
  return rows[0] || null;
}

async function listUsers(tenant_id) {
  const { rows } = await db.query(
    'SELECT id, tenant_id, email, name, status, created_at, updated_at FROM users WHERE tenant_id = ? ORDER BY created_at DESC',
    [tenant_id]
  );
  return rows;
}

async function createUser({ tenant_id, email, name, password_hash, status = 'active' }) {
  const { rows } = await db.query(
    'INSERT INTO users(tenant_id, email, name, password_hash, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, NOW(), NOW())',
    [tenant_id, email, name, password_hash, status]
  );
  // mysql2 returns OkPacket; fetch the row for return
  const { rows: created } = await db.query(
    'SELECT id, tenant_id, email, name, status, created_at, updated_at FROM users WHERE tenant_id = ? AND email = ?',
    [tenant_id, email]
  );
  return created[0] || null;
}

async function updateUser(tenant_id, id, { name, status }) {
  await db.query(
    'UPDATE users SET name = ?, status = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?',
    [name, status, tenant_id, id]
  );
  return findById(tenant_id, id);
}

async function deleteUser(tenant_id, id) {
  await db.query('DELETE FROM user_roles WHERE tenant_id = ? AND user_id = ?', [tenant_id, id]);
  await db.query('DELETE FROM users WHERE tenant_id = ? AND id = ?', [tenant_id, id]);
  return true;
}

async function setUserRole(tenant_id, user_id, role_name) {
  // Upsert into user_roles
  await db.query(
    'DELETE FROM user_roles WHERE tenant_id = ? AND user_id = ?',
    [tenant_id, user_id]
  );
  await db.query(
    'INSERT INTO user_roles (tenant_id, user_id, role_name) VALUES(?, ?, ?)',
    [tenant_id, user_id, role_name]
  );
  return true;
}

async function getUserRole(tenant_id, user_id) {
  const { rows } = await db.query(
    'SELECT role_name FROM user_roles WHERE tenant_id = ? AND user_id = ? LIMIT 1',
    [tenant_id, user_id]
  );
  return rows[0]?.role_name || 'viewer';
}

module.exports = {
  findByEmail,
  findById,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  setUserRole,
  getUserRole,
};
