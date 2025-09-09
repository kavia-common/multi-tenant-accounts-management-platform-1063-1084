-- Minimal reference schema for the accounts_database (MySQL)
-- This is for documentation; actual DB container should manage schema creation/migrations.

CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenant_email (tenant_id, email),
  INDEX idx_tenant (tenant_id),
  CONSTRAINT fk_users_org FOREIGN KEY (tenant_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  tenant_id INT NOT NULL,
  user_id INT NOT NULL,
  role_name VARCHAR(32) NOT NULL,
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_org FOREIGN KEY (tenant_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  user_id INT NOT NULL,
  token VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token (tenant_id, token),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_password_resets_org FOREIGN KEY (tenant_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  user_id INT NULL,
  action VARCHAR(128) NOT NULL,
  details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(64) NULL,
  INDEX idx_tenant_action (tenant_id, action),
  CONSTRAINT fk_audit_logs_org FOREIGN KEY (tenant_id) REFERENCES organizations(id)
);
