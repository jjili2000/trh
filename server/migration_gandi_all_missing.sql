-- ═══════════════════════════════════════════════════════════════════════════
-- Migration complète Gandi — tables manquantes
-- À importer UNE SEULE FOIS via phpMyAdmin sur trh_tennis
-- Toutes les instructions utilisent IF NOT EXISTS / IGNORE : sans danger
-- si certaines tables/colonnes existent déjà.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Positions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS positions (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 2. Documents RH ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id                    VARCHAR(36)  PRIMARY KEY,
  file_name             VARCHAR(255) NOT NULL,
  file_type             VARCHAR(100) NOT NULL,
  file_data             LONGTEXT     NOT NULL,
  document_type         VARCHAR(100),
  user_id               VARCHAR(36),
  detected_employee_name VARCHAR(200),
  period_start          DATE,
  period_end            DATE,
  notes                 TEXT,
  status                ENUM('pending_validation','validated') DEFAULT 'pending_validation',
  uploaded_by           VARCHAR(36)  NOT NULL,
  validated_at          DATETIME,
  created_at            DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 3. Saisons & calendrier ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seasons (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  start_date DATE         NOT NULL,
  end_date   DATE         NOT NULL,
  status     ENUM('draft','published','closed','deleted') NOT NULL DEFAULT 'draft',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS template_weeks (
  id        VARCHAR(36)  NOT NULL PRIMARY KEY,
  season_id VARCHAR(36)  NOT NULL,
  label     VARCHAR(100) NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS template_courses (
  id               VARCHAR(36)  NOT NULL PRIMARY KEY,
  template_week_id VARCHAR(36)  NOT NULL,
  label            VARCHAR(100) NOT NULL,
  day_of_week      TINYINT      NOT NULL COMMENT '1=Lundi … 7=Dimanche',
  start_time       TIME         NOT NULL,
  end_time         TIME         NOT NULL,
  teacher_id       VARCHAR(36)  NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_week_id) REFERENCES template_weeks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS season_week_assignments (
  id               VARCHAR(36)  NOT NULL PRIMARY KEY,
  season_id        VARCHAR(36)  NOT NULL,
  template_week_id VARCHAR(36)  NOT NULL,
  week_start_date  DATE         NOT NULL COMMENT 'Lundi de la semaine',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_season_week (season_id, week_start_date),
  FOREIGN KEY (season_id)        REFERENCES seasons(id)        ON DELETE CASCADE,
  FOREIGN KEY (template_week_id) REFERENCES template_weeks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 4. Budget ───────────────────────────────────────────────────────────────

-- Étendre le rôle utilisateur
ALTER TABLE users MODIFY COLUMN role ENUM('admin','manager','user','treasurer') NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS budget_requests (
  id               VARCHAR(36)  PRIMARY KEY,
  user_id          VARCHAR(36)  NOT NULL,
  label            VARCHAR(255) NOT NULL,
  start_date       DATE         NOT NULL,
  end_date         DATE         NOT NULL,
  comment          TEXT,
  status           ENUM('draft','submitted','approved','cancelled') DEFAULT 'draft',
  approver_id      VARCHAR(36),
  approver_comment TEXT,
  approved_at      DATETIME,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS budget_request_lines (
  id         VARCHAR(36)  PRIMARY KEY,
  request_id VARCHAR(36)  NOT NULL,
  type       ENUM('income','expense') NOT NULL,
  label      VARCHAR(255) NOT NULL,
  qty        DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order INT          DEFAULT 0,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES budget_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS real_budgets (
  id         VARCHAR(36)  PRIMARY KEY,
  request_id VARCHAR(36)  NOT NULL,
  user_id    VARCHAR(36)  NOT NULL,
  label      VARCHAR(255) NOT NULL,
  start_date DATE         NOT NULL,
  end_date   DATE         NOT NULL,
  status     ENUM('active','closed') DEFAULT 'active',
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES budget_requests(id),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS real_budget_lines (
  id              VARCHAR(36)  PRIMARY KEY,
  real_budget_id  VARCHAR(36)  NOT NULL,
  source_line_id  VARCHAR(36),
  type            ENUM('income','expense') NOT NULL,
  label           VARCHAR(255) NOT NULL,
  forecast_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order      INT          DEFAULT 0,
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (real_budget_id)  REFERENCES real_budgets(id)          ON DELETE CASCADE,
  FOREIGN KEY (source_line_id)  REFERENCES budget_request_lines(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS budget_line_details (
  id               VARCHAR(36)   PRIMARY KEY,
  line_id          VARCHAR(36)   NOT NULL,
  detail_date      DATE          NOT NULL,
  label            VARCHAR(255)  NOT NULL,
  payment_method   VARCHAR(100)  NOT NULL,
  qty              DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price       DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount           DECIMAL(10,2) NOT NULL,
  receipt_file     LONGTEXT,
  receipt_file_name  VARCHAR(255),
  receipt_file_type  VARCHAR(100),
  user_id          VARCHAR(36)   NOT NULL,
  created_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (line_id)  REFERENCES real_budget_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)             ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS budget_access_grants (
  id             VARCHAR(36) PRIMARY KEY,
  real_budget_id VARCHAR(36) NOT NULL,
  user_id        VARCHAR(36) NOT NULL,
  granted_by     VARCHAR(36) NOT NULL,
  created_at     DATETIME    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_access (real_budget_id, user_id),
  FOREIGN KEY (real_budget_id) REFERENCES real_budgets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE CASCADE,
  FOREIGN KEY (granted_by)     REFERENCES users(id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 5. Notifications ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         VARCHAR(36)  PRIMARY KEY,
  user_id    VARCHAR(36)  NOT NULL,
  type       VARCHAR(50)  NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  ref_type   VARCHAR(50),
  ref_id     VARCHAR(36),
  read_at    DATETIME,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 6. Comptabilité / imports bancaires ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS bank_imports (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  userId         VARCHAR(36)  NOT NULL,
  label          VARCHAR(255) NOT NULL,
  fileName       VARCHAR(255) NOT NULL,
  importedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  operationCount INT          NOT NULL DEFAULT 0,
  CONSTRAINT fk_bank_imports_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bank_operations (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  importId      VARCHAR(36)  NOT NULL,
  operationDate DATE         NOT NULL,
  direction     ENUM('credit','debit') NOT NULL,
  paymentMethod ENUM('card','transfer','direct_debit','check','cash','other') NOT NULL DEFAULT 'other',
  amount        DECIMAL(12,2) NOT NULL,
  rawLabel      TEXT,
  thirdParty    VARCHAR(500),
  blockMDT      VARCHAR(500),
  blockLIB      VARCHAR(500),
  blockMOTIF    VARCHAR(500),
  blockRNF      VARCHAR(500),
  category      VARCHAR(255),
  categorySource ENUM('manual','rule','none') NOT NULL DEFAULT 'none',
  ruleId        VARCHAR(36),
  createdAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bank_operations_import FOREIGN KEY (importId) REFERENCES bank_imports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS accounting_rules (
  id                VARCHAR(36)  NOT NULL PRIMARY KEY,
  userId            VARCHAR(36)  NOT NULL,
  label             VARCHAR(255) NOT NULL,
  conditionOperator ENUM('AND','OR') NOT NULL DEFAULT 'AND',
  category          VARCHAR(255) NOT NULL,
  priority          INT          NOT NULL DEFAULT 0,
  createdAt         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_accounting_rules_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS accounting_rule_conditions (
  id       VARCHAR(36)   NOT NULL PRIMARY KEY,
  ruleId   VARCHAR(36)   NOT NULL,
  field    ENUM('rawLabel','thirdParty','blockMDT','blockLIB','blockMOTIF','blockRNF','paymentMethod','direction') NOT NULL,
  operator ENUM('contains','equals','startsWith','endsWith','notContains') NOT NULL,
  value    VARCHAR(500)  NOT NULL,
  CONSTRAINT fk_arc_rule FOREIGN KEY (ruleId) REFERENCES accounting_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 7. Migrations colonnes expenses ─────────────────────────────────────────
-- Ignorer les erreurs "Duplicate column" si déjà exécuté précédemment

ALTER TABLE expenses ADD COLUMN vendor      VARCHAR(255)  NULL AFTER reason;
ALTER TABLE expenses ADD COLUMN amount_ht   DECIMAL(10,2) NULL AFTER vendor;
ALTER TABLE expenses ADD COLUMN vat_details TEXT          NULL AFTER amount_ht;

-- ─── 8. Migrations colonnes absences ─────────────────────────────────────────

ALTER TABLE absence_requests ADD COLUMN duration_days DECIMAL(4,1) NULL AFTER end_date;

-- ─── 9. Blocage utilisateurs ─────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN is_blocked TINYINT(1) NOT NULL DEFAULT 0 AFTER role;

-- ─── 10. Accès modules par utilisateur ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_module_access (
  id         VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  module     VARCHAR(50) NOT NULL,
  granted_by VARCHAR(36) NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_module (user_id, module),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_config (
  id         INT         NOT NULL PRIMARY KEY AUTO_INCREMENT,
  config_type VARCHAR(20) NOT NULL,
  mode        ENUM('AND','OR') NOT NULL DEFAULT 'OR',
  UNIQUE KEY uq_config_type (config_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO validation_config (config_type, mode) VALUES ('budget', 'OR'), ('expenses', 'OR');

CREATE TABLE IF NOT EXISTS validation_config_positions (
  id          INT         NOT NULL PRIMARY KEY AUTO_INCREMENT,
  config_type VARCHAR(20) NOT NULL,
  position_name VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_cfg_pos (config_type, position_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 11. Réinitialisation mot de passe ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36)  NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME     NOT NULL,
  used_at    DATETIME,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 12. Périodes de paie ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_periods (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  start_date DATE         NOT NULL,
  end_date   DATE         NOT NULL,
  label      VARCHAR(100),
  status     ENUM('draft','validated') NOT NULL DEFAULT 'draft',
  created_by VARCHAR(36)  NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
