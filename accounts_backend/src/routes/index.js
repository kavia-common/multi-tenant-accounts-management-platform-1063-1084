const express = require('express');
const healthController = require('../controllers/health');
const authController = require('../controllers/authController');
const usersController = require('../controllers/usersController');
const orgsController = require('../controllers/orgsController');
const dashboardController = require('../controllers/dashboardController');
const { authenticate, requireRole, requireTenant } = require('../middleware/auth');

const router = express.Router();

// Health endpoint
/**
 * @swagger
 * /:
 *   get:
 *     summary: Health endpoint
 *     tags: [Health]
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

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     RegisterRequest:
 *       type: object
 *       required: [tenant_id, email, name, password]
 *       properties:
 *         tenant_id:
 *           type: integer
 *           description: Tenant identifier (organization id)
 *         email:
 *           type: string
 *         name:
 *           type: string
 *         password:
 *           type: string
 *         role:
 *           type: string
 *           enum: [viewer, sales_rep, manager, admin]
 *     LoginRequest:
 *       type: object
 *       required: [tenant_id, email, password]
 *       properties:
 *         tenant_id: { type: integer }
 *         email: { type: string }
 *         password: { type: string }
 *     RefreshRequest:
 *       type: object
 *       required: [refresh_token]
 *       properties:
 *         refresh_token: { type: string }
 *     PasswordResetRequest:
 *       type: object
 *       required: [tenant_id, email]
 *       properties:
 *         tenant_id: { type: integer }
 *         email: { type: string }
 *     PasswordResetConfirm:
 *       type: object
 *       required: [tenant_id, new_password]
 *       properties:
 *         tenant_id: { type: integer }
 *         new_password: { type: string }
 *     UserCreate:
 *       type: object
 *       required: [email, name, password]
 *       properties:
 *         email: { type: string }
 *         name: { type: string }
 *         password: { type: string }
 *         status: { type: string }
 *         role:
 *           type: string
 *           enum: [viewer, sales_rep, manager, admin]
 *     UserUpdate:
 *       type: object
 *       properties:
 *         name: { type: string }
 *         status: { type: string }
 *         role:
 *           type: string
 *           enum: [viewer, sales_rep, manager, admin]
 *     OrgCreate:
 *       type: object
 *       required: [name]
 *       properties:
 *         name: { type: string }
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Register a new user scoped to a tenant with optional role assignment.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Registered successfully
 *       400:
 *         description: Bad request
 */
router.post('/auth/register', authController.register.bind(authController));

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and get tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Unauthorized
 */
router.post('/auth/login', authController.login.bind(authController));

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout
 *     security: [{ bearerAuth: [] }]
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/auth/logout', authenticate, authController.logout.bind(authController));

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshRequest'
 *     responses:
 *       200:
 *         description: New access token
 *       401:
 *         description: Invalid refresh token
 */
router.post('/auth/refresh', authController.refresh.bind(authController));

/**
 * @swagger
 * /auth/password-reset:
 *   post:
 *     summary: Request password reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetRequest'
 *     responses:
 *       200:
 *         description: Reset token generated
 */
router.post('/auth/password-reset', authController.requestReset.bind(authController));

/**
 * @swagger
 * /auth/password-reset/{token}:
 *   post:
 *     summary: Reset password using token
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetConfirm'
 *     responses:
 *       200:
 *         description: Password reset successful
 */
router.post('/auth/password-reset/:token', authController.resetPassword.bind(authController));

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List users
 *     security: [{ bearerAuth: [] }]
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of users
 *       403:
 *         description: Forbidden
 */
router.get('/users', authenticate, requireTenant, requireRole('manager'), usersController.list.bind(usersController));

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create user
 *     security: [{ bearerAuth: [] }]
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserCreate'
 *     responses:
 *       201:
 *         description: Created
 *       403:
 *         description: Forbidden
 */
router.post('/users', authenticate, requireTenant, requireRole('manager'), usersController.create.bind(usersController));

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update user
 *     security: [{ bearerAuth: [] }]
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserUpdate'
 *     responses:
 *       200:
 *         description: Updated
 *       403:
 *         description: Forbidden
 */
router.put('/users/:id', authenticate, requireTenant, requireRole('manager'), usersController.update.bind(usersController));

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user
 *     security: [{ bearerAuth: [] }]
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Forbidden
 */
router.delete('/users/:id', authenticate, requireTenant, requireRole('admin'), usersController.remove.bind(usersController));

/**
 * @swagger
 * /orgs:
 *   get:
 *     summary: List organizations
 *     security: [{ bearerAuth: [] }]
 *     tags: [Organizations]
 *     responses:
 *       200:
 *         description: List orgs
 */
router.get('/orgs', authenticate, requireRole('admin'), orgsController.list.bind(orgsController));

/**
 * @swagger
 * /orgs:
 *   post:
 *     summary: Create organization
 *     security: [{ bearerAuth: [] }]
 *     tags: [Organizations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrgCreate'
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/orgs', authenticate, requireRole('admin'), orgsController.create.bind(orgsController));

/**
 * @swagger
 * /orgs/{id}:
 *   put:
 *     summary: Update organization
 *     security: [{ bearerAuth: [] }]
 *     tags: [Organizations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/orgs/:id', authenticate, requireRole('admin'), orgsController.update.bind(orgsController));

/**
 * @swagger
 * /orgs/{id}:
 *   delete:
 *     summary: Delete organization
 *     security: [{ bearerAuth: [] }]
 *     tags: [Organizations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/orgs/:id', authenticate, requireRole('admin'), orgsController.remove.bind(orgsController));

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Get tenant dashboard
 *     security: [{ bearerAuth: [] }]
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Dashboard data
 */
router.get('/dashboard', authenticate, requireTenant, dashboardController.get.bind(dashboardController));

module.exports = router;
