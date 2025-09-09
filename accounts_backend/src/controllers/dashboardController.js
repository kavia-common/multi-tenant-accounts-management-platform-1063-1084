'use strict';

const dashboardService = require('../services/dashboardService');

class DashboardController {
  /**
   * PUBLIC_INTERFACE
   * Get role-based dashboard for current tenant.
   */
  async get(req, res) {
    /** Dashboard handler */
    try {
      const data = await dashboardService.getDashboard(req.user.tenant_id, req.user.role);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }
}

module.exports = new DashboardController();
