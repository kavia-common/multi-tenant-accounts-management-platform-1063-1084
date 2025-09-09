'use strict';
/**
 * Loads and exposes environment configuration.
 * Uses .env variables injected by orchestrator (do not read .env directly here).
 */
require('dotenv').config();

/**
 * PUBLIC_INTERFACE
 * getConfig
 * Returns the application configuration including database and JWT settings.
 */
function getConfig() {
  /** This is a public function returning configuration. */
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    // Database env vars provided by accounts_database container
    mysql: {
      url: process.env.MYSQL_URL,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DB,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : undefined,
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'please-change-in-env',
      issuer: process.env.JWT_ISSUER || 'accounts-backend',
      audience: process.env.JWT_AUDIENCE || 'accounts-frontend',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    },
  };
}

module.exports = {
  // PUBLIC_INTERFACE
  getConfig,
};
