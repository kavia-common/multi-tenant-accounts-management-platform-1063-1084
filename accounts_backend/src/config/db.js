'use strict';

/**
 * Database configuration and connection pool using mysql2/promise.
 * Reads connection details from environment variables provided by the database container.
 *
 * Required environment variables (set via orchestrator):
 * - MYSQL_URL: host/IP for MySQL server
 * - MYSQL_USER: username
 * - MYSQL_PASSWORD: password
 * - MYSQL_DB: database name
 * - MYSQL_PORT: port
 */

const mysql = require('mysql2/promise');

let pool;

/**
 * Initialize the MySQL pool singleton.
 */
async function initPool() {
  if (pool) return pool;

  const {
    MYSQL_URL,
    MYSQL_USER,
    MYSQL_PASSWORD,
    MYSQL_DB,
    MYSQL_PORT,
  } = process.env;

  if (!MYSQL_URL || !MYSQL_USER || !MYSQL_PASSWORD || !MYSQL_DB || !MYSQL_PORT) {
    // We intentionally do not read .env here; the orchestrator should provide env vars.
    throw new Error('Missing MySQL environment variables. Please set MYSQL_URL, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB, MYSQL_PORT.');
  }

  pool = mysql.createPool({
    host: MYSQL_URL,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DB,
    port: Number(MYSQL_PORT),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Ensures timezone consistency
    timezone: 'Z',
  });

  return pool;
}

/**
 * Get a connection from the pool.
 */
async function getConnection() {
  const p = await initPool();
  return p.getConnection();
}

/**
 * Execute a query using the pool.
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<{rows:any[], fields:any}>}
 */
async function query(sql, params = []) {
  const p = await initPool();
  const [rows, fields] = await p.execute(sql, params);
  return { rows, fields };
}

module.exports = {
  initPool,
  getConnection,
  query,
};
