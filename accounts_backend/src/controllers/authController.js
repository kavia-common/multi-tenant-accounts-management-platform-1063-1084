'use strict';

const authService = require('../services/authService');
const { hashPassword } = require('../utils/passwords');

/**
 * AuthController handles registration, login, logout, refresh, and password reset.
 */
class AuthController {
  /**
   * PUBLIC_INTERFACE
   * Register a new user for a tenant.
   */
  async register(req, res) {
    /** Register endpoint handler */
    try {
      const { tenant_id, email, name, password, role } = req.body;
      if (!tenant_id || !email || !name || !password) {
        return res.status(400).json({ message: 'tenant_id, email, name and password are required' });
      }
      const result = await authService.register({ tenant_id, email, name, password, role }, req.ip);
      return res.status(201).json(result);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Login with tenant_id, email, and password.
   */
  async login(req, res) {
    /** Login handler */
    try {
      const { tenant_id, email, password } = req.body;
      if (!tenant_id || !email || !password) {
        return res.status(400).json({ message: 'tenant_id, email and password are required' });
      }
      const result = await authService.login({ tenant_id, email, password }, req.ip);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(401).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Logout by blacklisting current access token.
   */
  async logout(req, res) {
    /** Logout handler */
    try {
      const auth = req.headers['authorization'] || '';
      const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null;
      await authService.logout(token, req.user?.tenant_id, req.user?.user_id, req.ip);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Refresh access token using refresh token.
   */
  async refresh(req, res) {
    /** Refresh token handler */
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) return res.status(400).json({ message: 'refresh_token is required' });
      const result = await authService.refresh(refresh_token);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(401).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Request password reset.
   */
  async requestReset(req, res) {
    /** Request password reset handler */
    try {
      const { tenant_id, email } = req.body;
      if (!tenant_id || !email) return res.status(400).json({ message: 'tenant_id and email are required' });
      const result = await authService.requestPasswordReset({ tenant_id, email }, req.ip);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Reset password with token.
   */
  async resetPassword(req, res) {
    /** Reset password handler */
    try {
      const { tenant_id } = req.body;
      const { token } = req.params;
      const { new_password } = req.body;
      if (!tenant_id || !token || !new_password) return res.status(400).json({ message: 'tenant_id, token and new_password are required' });
      await authService.resetPassword({ tenant_id, token, new_password }, req.ip);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Utility to hash a password (admin tool).
   */
  async hash(req, res) {
    /** Helper to hash a password (for testing seeding) */
    try {
      const { password } = req.body;
      if (!password) return res.status(400).json({ message: 'password required' });
      const hashed = await hashPassword(password);
      return res.status(200).json({ hashed });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }
}

module.exports = new AuthController();
