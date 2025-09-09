const { authenticate, requireRole, requireTenant } = require('./auth');

// This file exports middleware modules
module.exports = {
  authenticate,
  requireRole,
  requireTenant,
};
