'use strict';

const userService = require('../services/userService');
const { hashPassword } = require('../utils/passwords');

class UsersController {
  /**
   * PUBLIC_INTERFACE
   * List users in the tenant.
   */
  async list(req, res) {
    /** Return tenant users */
    try {
      const users = await userService.listUsers(req.user.tenant_id, req.user);
      return res.status(200).json({ users });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Create a user in the tenant.
   */
  async create(req, res) {
    /** Create user handler */
    try {
      const { email, name, password, status, role } = req.body;
      if (!email || !name || !password) return res.status(400).json({ message: 'email, name, password required' });
      const password_hash = await (password ? hashPassword(password) : Promise.resolve(null));
      const user = await userService.createUser(
        req.user.tenant_id,
        { email, name, password_hash, status, role },
        req.user,
        req.ip
      );
      return res.status(201).json({ user });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Update a user in the tenant.
   */
  async update(req, res) {
    /** Update user handler */
    try {
      const { id } = req.params;
      const { name, status, role } = req.body;
      const updated = await userService.updateUser(req.user.tenant_id, Number(id), { name, status, role }, req.user, req.ip);
      return res.status(200).json({ user: updated });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Delete a user.
   */
  async remove(req, res) {
    /** Delete user handler */
    try {
      const { id } = req.params;
      await userService.deleteUser(req.user.tenant_id, Number(id), req.user, req.ip);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }
}

module.exports = new UsersController();
