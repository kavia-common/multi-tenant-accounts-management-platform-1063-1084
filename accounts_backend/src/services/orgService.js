'use strict';

const orgModel = require('../models/orgModel');
const miscModel = require('../models/miscModel');

/**
 * PUBLIC_INTERFACE
 * Create organization.
 */
async function createOrg(payload, requester, ip) {
  /** Create a new organization record. */
  const org = await orgModel.createOrg({ name: payload.name });
  await miscModel.createAuditLog(org.id, requester?.user_id, 'org_create', { org_id: org.id }, ip);
  return org;
}

/**
 * PUBLIC_INTERFACE
 * List organizations (admin only context-wide).
 */
async function listOrgs() {
  /** Return all organizations. */
  return orgModel.listOrgs();
}

/**
 * PUBLIC_INTERFACE
 * Update organization.
 */
async function updateOrg(id, payload, requester, ip) {
  /** Update org name. */
  const updated = await orgModel.updateOrg(id, { name: payload.name });
  await miscModel.createAuditLog(id, requester?.user_id, 'org_update', { org_id: id }, ip);
  return updated;
}

/**
 * PUBLIC_INTERFACE
 * Delete organization.
 */
async function deleteOrg(id, requester, ip) {
  /** Delete org. Ensure cascading constraints at DB. */
  await orgModel.deleteOrg(id);
  await miscModel.createAuditLog(id, requester?.user_id, 'org_delete', { org_id: id }, ip);
  return true;
}

module.exports = {
  createOrg,
  listOrgs,
  updateOrg,
  deleteOrg,
};
