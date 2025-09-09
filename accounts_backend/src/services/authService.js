'use strict';

const { hashPassword, comparePassword } = require('../utils/passwords');
const { issueAccessToken, issueRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const userModel = require('../models/userModel');
const miscModel = require('../models/miscModel');

/**
 * In-memory token blacklist for demonstration. In production, use a persistent store (Redis).
 */
const tokenBlacklist = new Set();

/**
 * PUBLIC_INTERFACE
 * Register a user within a tenant. For a new organization flow, caller should create org first and pass tenant_id.
 * @param {{tenant_id:number, email:string, name:string, password:string, role:string}} payload
 * @returns {Promise<{user:object, access_token:string, refresh_token:string}>}
 */
async function register(payload, ip) {
  /** Register a user and return tokens. */
  const { tenant_id, email, name, password, role } = payload;
  const existing = await userModel.findByEmail(tenant_id, email);
  if (existing) throw new Error('User already exists for this tenant');

  const password_hash = await hashPassword(password);
  const user = await userModel.createUser({ tenant_id, email, name, password_hash, status: 'active' });
  await userModel.setUserRole(tenant_id, user.id, role || 'viewer');

  const access_token = issueAccessToken({ user_id: user.id, tenant_id, role: role || 'viewer', email, name });
  const refresh_token = issueRefreshToken({ user_id: user.id, tenant_id });

  await miscModel.createAuditLog(tenant_id, user.id, 'user_register', { email }, ip);

  return { user, access_token, refresh_token };
}

/**
 * PUBLIC_INTERFACE
 * Login and return tokens.
 */
async function login({ tenant_id, email, password }, ip) {
  /** Authenticate a user by tenant and email/password. */
  const user = await userModel.findByEmail(tenant_id, email);
  if (!user) throw new Error('Invalid credentials');
  if (user.status !== 'active') throw new Error('User is not active');

  const ok = await comparePassword(password, user.password_hash);
  if (!ok) throw new Error('Invalid credentials');

  const role = await userModel.getUserRole(tenant_id, user.id);
  const access_token = issueAccessToken({ user_id: user.id, tenant_id, role, email: user.email, name: user.name });
  const refresh_token = issueRefreshToken({ user_id: user.id, tenant_id });

  await miscModel.createAuditLog(tenant_id, user.id, 'user_login', { email }, ip);

  return { user: { id: user.id, email: user.email, name: user.name, status: user.status, tenant_id }, access_token, refresh_token, role };
}

/**
 * PUBLIC_INTERFACE
 * Logout: blacklist the provided access token.
 */
async function logout(accessToken, tenant_id, user_id, ip) {
  /** Blacklist access token to simulate invalidation. */
  if (accessToken) tokenBlacklist.add(accessToken);
  await miscModel.createAuditLog(tenant_id, user_id, 'user_logout', {}, ip);
  return true;
}

/**
 * PUBLIC_INTERFACE
 * Refresh: exchange refresh token for new access token.
 */
async function refresh(refreshToken) {
  /** Exchange a refresh token for a new access token. */
  const decoded = verifyRefreshToken(refreshToken);
  const { user_id, tenant_id } = decoded;
  const user = await userModel.findById(tenant_id, user_id);
  if (!user) throw new Error('User not found');
  const role = await userModel.getUserRole(tenant_id, user.id);
  const access_token = issueAccessToken({ user_id: user.id, tenant_id, role, email: user.email, name: user.name });
  return { access_token };
}

/**
 * PUBLIC_INTERFACE
 * Request a password reset token.
 */
async function requestPasswordReset({ tenant_id, email }, ip) {
  /** Generate a password reset token. */
  const user = await userModel.findByEmail(tenant_id, email);
  if (!user) throw new Error('User not found');
  const token = await miscModel.createPasswordReset(tenant_id, user.id, 30);
  await miscModel.createAuditLog(tenant_id, user.id, 'password_reset_requested', {}, ip);
  // In real app, email the token. Here, return for demonstration.
  return { token };
}

/**
 * PUBLIC_INTERFACE
 * Confirm password reset using token.
 */
async function resetPassword({ tenant_id, token, new_password }, ip) {
  /** Validate reset token and update password. */
  const rec = await miscModel.getPasswordReset(tenant_id, token);
  if (!rec) throw new Error('Invalid or expired reset token');
  const password_hash = await hashPassword(new_password);
  await require('../config/db').query(
    'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?',
    [password_hash, tenant_id, rec.user_id]
  );
  await miscModel.markPasswordResetUsed(tenant_id, token);
  await miscModel.createAuditLog(tenant_id, rec.user_id, 'password_reset_completed', {}, ip);
  return true;
}

/**
 * PUBLIC_INTERFACE
 * Check if an access token is blacklisted.
 */
function isTokenBlacklisted(token) {
  /** In-memory check of blacklisted tokens. */
  return tokenBlacklist.has(token);
}

module.exports = {
  register,
  login,
  logout,
  refresh,
  requestPasswordReset,
  resetPassword,
  isTokenBlacklisted,
};
