const express = require('express');
const healthController = require('../controllers/health');
const contactsRoutes = require('./contacts');
const pipelineRoutes = require('./pipeline');

const router = express.Router();
// Health endpoint

/**
 * @swagger
 * /:
 *   get:
 *     summary: Health endpoint
 *     responses:
 *       200:
 *         description: Service health check passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Service is healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 */
router.get('/', healthController.check.bind(healthController));

// Mount new contact management API routes under /api/contacts
router.use('/api/contacts', contactsRoutes);

// Mount pipeline routes
router.use('/api/pipeline', pipelineRoutes);

module.exports = router;
