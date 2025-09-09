const { authenticateJWT, requireRoles } = require('./auth');

// This file will export middleware as the application grows
module.exports = {
  authenticateJWT,
  requireRoles,
};
