'use strict';

const orgService = require('../services/orgService');

class OrgsController {
  /**
   * PUBLIC_INTERFACE
   * Create organization.
   */
  async create(req, res) {
    /** Create organization handler */
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: 'name required' });
      const org = await orgService.createOrg({ name }, req.user, req.ip);
      return res.status(201).json({ org });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * List organizations.
   */
  async list(req, res) {
    /** List organizations handler */
    try {
      const orgs = await orgService.listOrgs();
      return res.status(200).json({ orgs });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Update organization.
   */
  async update(req, res) {
    /** Update org handler */
    try {
      const { id } = req.params;
      const { name } = req.body;
      const updated = await orgService.updateOrg(Number(id), { name }, req.user, req.ip);
      return res.status(200).json({ org: updated });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Delete organization.
   */
  async remove(req, res) {
    /** Delete org handler */
    try {
      const { id } = req.params;
      await orgService.deleteOrg(Number(id), req.user, req.ip);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }
}

module.exports = new OrgsController();
