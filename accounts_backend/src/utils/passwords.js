'use strict';

const bcrypt = require('bcrypt');

/**
 * Hash a plaintext password.
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  return bcrypt.hash(password, rounds);
}

/**
 * Compare plaintext with hashed password.
 * @param {string} password
 * @param {string} hashed
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hashed) {
  return bcrypt.compare(password, hashed);
}

module.exports = {
  hashPassword,
  comparePassword,
};
