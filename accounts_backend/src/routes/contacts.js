'use strict';
const express = require('express');
const controller = require('../controllers/contacts');
const { authenticateJWT, requireRoles } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Contacts
 *   description: Contact management endpoints (multi-tenant)
 */

/**
 * @swagger
 * /api/contacts:
 *   get:
 *     summary: List contacts
 *     tags: [Contacts]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search query across name/email/phone/company
 *       - in: query
 *         name: tags
 *         schema: { type: string }
 *         description: Comma-separated tag names
 *       - in: query
 *         name: categories
 *         schema: { type: string }
 *         description: Comma-separated category names
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *     responses:
 *       200:
 *         description: Paginated contact list
 */
router.get('/', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.list.bind(controller));

/**
 * @swagger
 * /api/contacts:
 *   post:
 *     summary: Create contact
 *     tags: [Contacts]
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.create.bind(controller));

/**
 * @swagger
 * /api/contacts/{id}:
 *   get:
 *     summary: Get contact by ID
 *     tags: [Contacts]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: integer }
 *         required: true
 *     responses:
 *       200:
 *         description: Contact
 */
router.get('/:id', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.getById.bind(controller));

/**
 * @swagger
 * /api/contacts/{id}:
 *   put:
 *     summary: Update contact
 *     tags: [Contacts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.update.bind(controller));

/**
 * @swagger
 * /api/contacts/{id}:
 *   delete:
 *     summary: Delete contact
 *     tags: [Contacts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', authenticateJWT, requireRoles(['Admin','Manager']), controller.remove.bind(controller));

/**
 * @swagger
 * /api/contacts/{id}/notes:
 *   get:
 *     summary: Get notes
 *     tags: [Contacts]
 *   post:
 *     summary: Add note
 *     tags: [Contacts]
 */
router.get('/:id/notes', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.getNotes.bind(controller));
router.post('/:id/notes', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.addNote.bind(controller));

/**
 * @swagger
 * /api/contacts/{id}/timeline:
 *   get:
 *     summary: Get interaction timeline
 *     tags: [Contacts]
 *   post:
 *     summary: Add timeline event
 *     tags: [Contacts]
 */
router.get('/:id/timeline', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.getTimeline.bind(controller));
router.post('/:id/timeline', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep']), controller.addTimeline.bind(controller));

/**
 * @swagger
 * /api/contacts/duplicates:
 *   get:
 *     summary: Detect duplicate contacts
 *     tags: [Contacts]
 */
router.get('/duplicates/check', authenticateJWT, requireRoles(['Admin','Manager']), controller.duplicates.bind(controller));

/**
 * @swagger
 * /api/contacts/{id}/merge:
 *   post:
 *     summary: Merge contacts into target
 *     tags: [Contacts]
 */
router.post('/:id/merge', authenticateJWT, requireRoles(['Admin','Manager']), controller.merge.bind(controller));

/**
 * @swagger
 * /api/contacts/import:
 *   post:
 *     summary: Bulk import contacts
 *     tags: [Contacts]
 */
router.post('/import', authenticateJWT, requireRoles(['Admin','Manager']), controller.bulkImport.bind(controller));

/**
 * @swagger
 * /api/contacts/export/csv:
 *   get:
 *     summary: Export contacts as CSV
 *     tags: [Contacts]
 */
router.get('/export/csv', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.exportCSV.bind(controller));

/**
 * @swagger
 * /api/contacts/export/xlsx:
 *   get:
 *     summary: Export contacts as Excel
 *     tags: [Contacts]
 */
router.get('/export/xlsx', authenticateJWT, requireRoles(['Admin','Manager','Sales Rep','Viewer']), controller.exportXLSX.bind(controller));

module.exports = router;
