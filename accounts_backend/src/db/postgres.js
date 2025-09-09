'use strict';
const { Pool } = require('pg');

/**
 * Loads PostgreSQL configuration from environment variables injected by orchestrator.
 * Do not read .env directly here; values are provided at runtime.
 */
function getPgConfig() {
  return {
    connectionString: process.env.POSTGRES_URL || undefined,
    host: process.env.POSTGRES_HOST || undefined,
    user: process.env.POSTGRES_USER || undefined,
    password: process.env.POSTGRES_PASSWORD || undefined,
    database: process.env.POSTGRES_DB || undefined,
    port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
  };
}

let pool;

/**
 * Initialize or reuse a singleton Pool.
 */
function initPool() {
  if (pool) return pool;
  const cfg = getPgConfig();

  // If connectionString provided, prefer it, else pass discrete params
  pool = cfg.connectionString ? new Pool({ connectionString: cfg.connectionString, max: cfg.max, idleTimeoutMillis: cfg.idleTimeoutMillis })
                              : new Pool(cfg);
  return pool;
}

/**
 * PUBLIC_INTERFACE
 * pgQuery
 * Execute a parameterized query against Postgres.
 * @param {string} text SQL text with $1, $2 placeholders
 * @param {Array<any>} params values for placeholders
 * @returns {Promise<{rows: any[], rowCount: number}>}
 */
async function pgQuery(text, params = []) {
  /** Executes a Postgres query and returns rows and rowCount. */
  const p = initPool();
  const res = await p.query(text, params);
  return { rows: res.rows, rowCount: res.rowCount };
}

/**
 * PUBLIC_INTERFACE
 * pgGetClient
 * Get a dedicated client for transaction management.
 * @returns {Promise<import('pg').PoolClient>}
 */
async function pgGetClient() {
  /** Returns a client for BEGIN/COMMIT/ROLLBACK usage. */
  const p = initPool();
  return p.connect();
}

module.exports = {
  // PUBLIC_INTERFACE
  pgQuery,
  // PUBLIC_INTERFACE
  pgGetClient,
};
