'use strict';
const mysql = require('mysql2/promise');
const { getConfig } = require('../config/env');

let pool;

/**
 * Initialize a singleton connection pool.
 */
function initPool() {
  if (pool) return pool;
  const cfg = getConfig().mysql;

  // Support either MYSQL_URL or discrete parameters
  if (cfg.url) {
    pool = mysql.createPool(cfg.url);
  } else {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      port: cfg.port || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: false,
    });
  }
  return pool;
}

/**
 * PUBLIC_INTERFACE
 * query
 * Executes a parameterized SQL query using the pool.
 * @param {string} sql - SQL string with ? placeholders
 * @param {Array<any>} params - Parameters for placeholders
 * @returns {Promise<{rows: any[], fields: any[]}>}
 */
async function query(sql, params = []) {
  /** Execute a query and return rows and fields. */
  const p = initPool();
  const [rows, fields] = await p.execute(sql, params);
  return { rows, fields };
}

/**
 * PUBLIC_INTERFACE
 * getConnection
 * Get a dedicated connection for transactions.
 * @returns {Promise<import('mysql2/promise').PoolConnection>}
 */
async function getConnection() {
  /** Get a connection from pool for manual transaction control. */
  const p = initPool();
  return p.getConnection();
}

module.exports = {
  // PUBLIC_INTERFACE
  query,
  // PUBLIC_INTERFACE
  getConnection,
};
