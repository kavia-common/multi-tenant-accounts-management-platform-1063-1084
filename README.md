# multi-tenant-accounts-management-platform-1063-1084

Accounts Backend (Express)
- JWT-based authentication (access + refresh)
- Role-based RBAC: admin > manager > sales_rep > viewer
- Multi-tenant scoping via tenant_id
- Endpoints: auth (register, login, logout, refresh, password reset), users, organizations, dashboard
- Swagger docs at /docs

Environment variables (configure via orchestrator; do not hardcode):
- PORT
- HOST
- JWT_SECRET
- JWT_REFRESH_SECRET (optional; falls back to JWT_SECRET)
- JWT_EXPIRES_IN (default 1h)
- JWT_REFRESH_EXPIRES_IN (default 7d)
- BCRYPT_ROUNDS (default 10)
- MYSQL_URL, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB, MYSQL_PORT

Interfaces:
- OpenAPI available at /openapi.json (use the openapi:generate script if needed to refresh file in interfaces)