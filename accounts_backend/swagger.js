const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Accounts Backend API',
      version: '1.0.0',
      description: 'Multi-tenant accounts management API with JWT authentication and RBAC',
    },
    tags: [
      { name: 'Health', description: 'Service health' },
      { name: 'Auth', description: 'Authentication and session management' },
      { name: 'Users', description: 'User management within tenant' },
      { name: 'Organizations', description: 'Organization management (admins)' },
      { name: 'Dashboard', description: 'Role-based dashboard data' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.js'], // Path to the API docs
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
