# Sales Pipeline Minimal Schema Expectations

This backend assumes the following MySQL tables exist in the accounts_database with `tenant_id` for multi-tenancy. Adjust names if your schema differs.

- pipeline_stages
  - id BIGINT PK AUTO_INCREMENT
  - tenant_id VARCHAR(64) or BIGINT
  - name VARCHAR(255)
  - position INT
  - is_won TINYINT(1) DEFAULT 0
  - is_lost TINYINT(1) DEFAULT 0
  - probability INT NULL    -- stage-level default probability 0..100
  - created_at DATETIME, updated_at DATETIME

- deals
  - id BIGINT PK AUTO_INCREMENT
  - tenant_id
  - name VARCHAR(255)
  - contact_id BIGINT NULL  -- contacts.id
  - owner_user_id BIGINT NULL -- users.id
  - stage_id BIGINT NOT NULL -- pipeline_stages.id
  - value DECIMAL(18,2) DEFAULT 0
  - currency VARCHAR(8) DEFAULT 'USD'
  - probability INT NULL   -- override stage probability
  - expected_close_date DATE NULL
  - kanban_position INT NOT NULL DEFAULT 1
  - status ENUM('open','won','lost','on_hold') DEFAULT 'open'
  - custom_fields JSON NULL
  - created_at DATETIME, updated_at DATETIME

- deal_activities
  - id BIGINT PK AUTO_INCREMENT
  - tenant_id
  - deal_id BIGINT NOT NULL -- deals.id
  - type ENUM('call','email','meeting','task') NOT NULL
  - subject VARCHAR(255) NULL
  - notes TEXT NULL
  - metadata JSON NULL
  - due_date DATETIME NULL
  - status ENUM('open','done','cancelled') DEFAULT 'open'
  - created_by BIGINT NULL -- users.id
  - created_at DATETIME, updated_at DATETIME

- email_templates
  - id BIGINT PK AUTO_INCREMENT
  - tenant_id
  - name VARCHAR(255) NOT NULL
  - subject VARCHAR(512) NOT NULL
  - body_html MEDIUMTEXT NULL
  - body_text MEDIUMTEXT NULL
  - created_by BIGINT NULL
  - created_at DATETIME, updated_at DATETIME

- email_sequences
  - id BIGINT PK AUTO_INCREMENT
  - tenant_id
  - name VARCHAR(255) NOT NULL
  - description TEXT NULL
  - created_by BIGINT NULL
  - created_at DATETIME, updated_at DATETIME

- email_sequence_steps
  - id BIGINT PK AUTO_INCREMENT
  - tenant_id
  - sequence_id BIGINT NOT NULL -- email_sequences.id
  - position INT NOT NULL
  - template_id BIGINT NULL -- email_templates.id
  - delay_days INT NOT NULL DEFAULT 0
  - created_at DATETIME, updated_at DATETIME

- email_outbox
  - id BIGINT PK AUTO_INCREMENT
  - tenant_id
  - to VARCHAR(1024) NOT NULL
  - cc VARCHAR(1024) NULL
  - bcc VARCHAR(1024) NULL
  - subject VARCHAR(512) NOT NULL
  - body_html MEDIUMTEXT NULL
  - body_text MEDIUMTEXT NULL
  - send_after DATETIME NULL
  - status ENUM('queued','sent','failed') DEFAULT 'queued'
  - created_by BIGINT NULL
  - created_at DATETIME, updated_at DATETIME

- appointments
  - id BIGINT PK AUTO_INCREMENT
  - tenant_id
  - title VARCHAR(255) NOT NULL
  - description TEXT NULL
  - start_time DATETIME NOT NULL
  - end_time DATETIME NOT NULL
  - organizer_user_id BIGINT NULL -- users.id
  - attendee_contact_id BIGINT NULL -- contacts.id
  - location VARCHAR(255) NULL
  - created_at DATETIME, updated_at DATETIME

- organization_settings
  - tenant_id PK
  - last_assigned_user_id BIGINT NULL

Note:
- All queries enforce tenant isolation.
- RBAC is enforced at routes using middleware.
- If your schema differs, adapt column names accordingly in services/pipeline.js.
