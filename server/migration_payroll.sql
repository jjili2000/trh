-- Migration : module de gestion de la paie
-- Table des périodes de paie

CREATE TABLE IF NOT EXISTS payroll_periods (
  id           VARCHAR(36)   NOT NULL PRIMARY KEY,
  start_date   DATE          NOT NULL,
  end_date     DATE          NOT NULL,
  status       ENUM('draft','validated') NOT NULL DEFAULT 'draft',
  created_by   VARCHAR(36)   NOT NULL,
  validated_by VARCHAR(36)   NULL DEFAULT NULL,
  validated_at DATETIME      NULL DEFAULT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payroll_created_by  FOREIGN KEY (created_by)   REFERENCES users(id),
  CONSTRAINT fk_payroll_validated_by FOREIGN KEY (validated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
