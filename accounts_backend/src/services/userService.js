'use strict';

const userModel = require('../models/userModel');
const miscModel = require('../models/miscModel');

/**
 * PUBLIC_INTERFACE
 * List users for a tenant (requires at least manager).
 */
async function listUsers(tenant_id, requester) {
  /** Return all users in the tenant */
  return userModel.listUsers(tenant_id);
}

/**
 * PUBLIC_INTERFACE
 * Create a user in the tenant (admin or manager).
 */
async function createUser(tenant_id, payload, requester, ip) {
  /** Create a user and optionally assign role. */
  const { email, name, password_hash, status, role } = payload;
  const existing = await userModel.findByEmail(tenant_id, email);
  if (existing) throw new Error('User already exists');
  const created = await userModel.createUser({ tenant_id, email, name, password_hash, status: status || 'active' });
  if (role) await userModel.setUserRole(tenant_id, created.id, role);
  await miscModel.createAuditLog(tenant_id, requester?.user_id, 'user_create', { user_id: created.id }, ip);
  return created;
}

/**
 * PUBLIC_INTERFACE
 * Update a user.
 */
async function updateUser(tenant_id, user_id, updates, requester, ip) {
  /** Update user fields and optionally role. */
  const updated = await userModel.updateUser(tenant_id, user_id, { name: updates.name, status: updates.status });
  if (updates.role) await userModel.setUserRole(tenant_id, user_id, updates.role);
  await miscModel.createAuditLog(tenant_id, requester?.user_id, 'user_update', { user_id }, ip);
  return updated;
}

/**
 * PUBLIC_INTERFACE
 * Delete a user.
 */
async function deleteUser(tenant_id, user_id, requester, ip) {
  /** Remove user and their role mapping. */
  await userModel.deleteUser(tenant_id, user_id);
  await miscModel.createAuditLog(tenant_id, requester?.user_id, 'user_delete', { user_id }, ip);
  return true;
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
};
