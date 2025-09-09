'use strict';
const express = require('express');
const controller = require('../controllers/pipeline');
const { authenticateJWT, requireRoles } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Pipeline
 *   description: Sales pipeline management (multi-tenant, JWT/RBAC)
 */

/**
 * @swagger
 * /api/pipeline/stages:
 *   get:
 *     summary: List pipeline stages
 *     tags: [Pipeline]
 *   post:
 *     summary: Create a pipeline stage
 *     tags: [Pipeline]
 */
router.get('/stages', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.listStages.bind(controller));
router.post('/stages', authenticateJWT, requireRoles(['Admin','Manager']), controller.createStage.bind(controller));

/**
 * @swagger
 * /api/pipeline/stages/{id}:
 *   put:
 *     summary: Update a pipeline stage
 *     tags: [Pipeline]
 *   delete:
 *     summary: Delete a pipeline stage
 *     tags: [Pipeline]
 */
router.put('/stages/:id', authenticateJWT, requireRoles(['Admin','Manager']), controller.updateStage.bind(controller));
router.delete('/stages/:id', authenticateJWT, requireRoles(['Admin','Manager']), controller.deleteStage.bind(controller));

/**
 * @swagger
 * /api/pipeline/stages/{id}/reorder:
 *   post:
 *     summary: Reorder stage (drag-drop)
 *     tags: [Pipeline]
 */
router.post('/stages/:id/reorder', authenticateJWT, requireRoles(['Admin','Manager']), controller.reorderStages.bind(controller));

/**
 * @swagger
 * /api/pipeline/deals:
 *   get:
 *     summary: List deals with filters
 *     tags: [Pipeline]
 *   post:
 *     summary: Create deal
 *     tags: [Pipeline]
 */
router.get('/deals', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.listDeals.bind(controller));
router.post('/deals', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.createDeal.bind(controller));

/**
 * @swagger
 * /api/pipeline/deals/{id}:
 *   get:
 *     summary: Get deal
 *     tags: [Pipeline]
 *   put:
 *     summary: Update deal
 *     tags: [Pipeline]
 *   delete:
 *     summary: Delete deal
 *     tags: [Pipeline]
 */
router.get('/deals/:id', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.getDeal.bind(controller));
router.put('/deals/:id', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.updateDeal.bind(controller));
router.delete('/deals/:id', authenticateJWT, requireRoles(['Admin','Manager']), controller.deleteDeal.bind(controller));

/**
 * @swagger
 * /api/pipeline/deals/{id}/move:
 *   post:
 *     summary: Drag-drop move deal between stages/positions
 *     tags: [Pipeline]
 */
router.post('/deals/:id/move', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.moveDeal.bind(controller));

/**
 * @swagger
 * /api/pipeline/activities:
 *   get:
 *     summary: List activities
 *     tags: [Pipeline]
 *   post:
 *     summary: Add activity
 *     tags: [Pipeline]
 */
router.get('/activities', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.listActivities.bind(controller));
router.post('/activities', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.addActivity.bind(controller));

/**
 * @swagger
 * /api/pipeline/activities/{id}:
 *   put:
 *     summary: Update activity
 *     tags: [Pipeline]
 *   delete:
 *     summary: Delete activity
 *     tags: [Pipeline]
 */
router.put('/activities/:id', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.updateActivity.bind(controller));
router.delete('/activities/:id', authenticateJWT, requireRoles(['Admin','Manager']), controller.deleteActivity.bind(controller));

/**
 * @swagger
 * /api/pipeline/forecast:
 *   get:
 *     summary: Forecast deals (weighted)
 *     tags: [Pipeline]
 */
router.get('/forecast', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.forecast.bind(controller));

/**
 * @swagger
 * /api/pipeline/analytics/funnel:
 *   get:
 *     summary: Sales funnel analytics
 *     tags: [Pipeline]
 */
router.get('/analytics/funnel', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.funnel.bind(controller));

/**
 * @swagger
 * /api/pipeline/analytics/conversions:
 *   get:
 *     summary: Conversion tracking
 *     tags: [Pipeline]
 */
router.get('/analytics/conversions', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.conversions.bind(controller));

/**
 * @swagger
 * /api/pipeline/leads/{contactId}/score:
 *   get:
 *     summary: Lead scoring
 *     tags: [Pipeline]
 */
router.get('/leads/:contactId/score', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.leadScore.bind(controller));

/**
 * @swagger
 * /api/pipeline/leads/{contactId}/auto-assign:
 *   post:
 *     summary: Auto assign lead
 *     tags: [Pipeline]
 */
router.post('/leads/:contactId/auto-assign', authenticateJWT, requireRoles(['Admin','Manager']), controller.autoAssignLead.bind(controller));

/**
 * @swagger
 * /api/pipeline/email/templates:
 *   get:
 *     summary: List email templates
 *     tags: [Pipeline]
 *   post:
 *     summary: Create email template
 *     tags: [Pipeline]
 */
router.get('/email/templates', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.listEmailTemplates.bind(controller));
router.post('/email/templates', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.createEmailTemplate.bind(controller));

/**
 * @swagger
 * /api/pipeline/email/templates/{id}:
 *   put:
 *     summary: Update email template
 *     tags: [Pipeline]
 *   delete:
 *     summary: Delete email template
 *     tags: [Pipeline]
 */
router.put('/email/templates/:id', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.updateEmailTemplate.bind(controller));
router.delete('/email/templates/:id', authenticateJWT, requireRoles(['Admin','Manager']), controller.deleteEmailTemplate.bind(controller));

/**
 * @swagger
 * /api/pipeline/email/sequences:
 *   post:
 *     summary: Create email sequence
 *     tags: [Pipeline]
 */
router.post('/email/sequences', authenticateJWT, requireRoles(['Admin','Manager']), controller.createEmailSequence.bind(controller));

/**
 * @swagger
 * /api/pipeline/email/send:
 *   post:
 *     summary: Queue email send (basic workflow)
 *     tags: [Pipeline]
 */
router.post('/email/send', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.sendEmail.bind(controller));

/**
 * @swagger
 * /api/pipeline/schedule:
 *   get:
 *     summary: List appointments
 *     tags: [Pipeline]
 *   post:
 *     summary: Schedule appointment
 *     tags: [Pipeline]
 */
router.get('/schedule', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.listAppointments.bind(controller));
router.post('/schedule', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.schedule.bind(controller));

module.exports = router;
