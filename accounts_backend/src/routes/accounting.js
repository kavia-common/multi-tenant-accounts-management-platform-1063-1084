'use strict';
const express = require('express');
const controller = require('../controllers/accounting');
const { authenticateJWT, requireRoles } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Accounting
 *   description: Daily operations (sales, expenses, petty cash), validation, and balances
 */

/**
 * @swagger
 * /api/accounting/sales:
 *   post:
 *     summary: Record sales entry with auto-journal posting and multi-payment
 *     tags: [Accounting]
 */
router.post(
  '/sales',
  authenticateJWT,
  requireRoles(['Admin', 'Manager']),
  controller.createSales.bind(controller)
);

/**
 * @swagger
 * /api/accounting/sales/bulk:
 *   post:
 *     summary: Bulk sales creation (atomic)
 *     tags: [Accounting]
 */
router.post(
  '/sales/bulk',
  authenticateJWT,
  requireRoles(['Admin', 'Manager']),
  controller.bulkSales.bind(controller)
);

/**
 * @swagger
 * /api/accounting/expenses:
 *   post:
 *     summary: Record expense entry with categorization and posting
 *     tags: [Accounting]
 */
router.post(
  '/expenses',
  authenticateJWT,
  requireRoles(['Admin', 'Manager']),
  controller.createExpense.bind(controller)
);

/**
 * @swagger
 * /api/accounting/expenses/bulk:
 *   post:
 *     summary: Bulk expenses creation (atomic)
 *     tags: [Accounting]
 */
router.post(
  '/expenses/bulk',
  authenticateJWT,
  requireRoles(['Admin', 'Manager']),
  controller.bulkExpenses.bind(controller)
);

/**
 * @swagger
 * /api/accounting/petty-cash:
 *   post:
 *     summary: Petty cash top-up or expense entry
 *     tags: [Accounting]
 */
router.post(
  '/petty-cash',
  authenticateJWT,
  requireRoles(['Admin', 'Manager']),
  controller.pettyCash.bind(controller)
);

/**
 * @swagger
 * /api/accounting/validate:
 *   post:
 *     summary: Validate transaction payload structure
 *     tags: [Accounting]
 */
router.post(
  '/validate',
  authenticateJWT,
  requireRoles(['Admin', 'Manager']),
  controller.validate.bind(controller)
);

/**
 * @swagger
 * /api/accounting/balances:
 *   get:
 *     summary: Get real-time balances for accounts
 *     tags: [Accounting]
 */
router.get(
  '/balances',
  authenticateJWT,
  requireRoles(['Admin', 'Manager', 'Viewer']),
  controller.balances.bind(controller)
);

module.exports = router;
