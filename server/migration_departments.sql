-- Migration : Directions (departments)
-- À importer via phpMyAdmin sur trh_tennis

CREATE TABLE IF NOT EXISTS departments (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  parent_id  VARCHAR(36)  NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Utilisateurs : direction optionnelle
ALTER TABLE users ADD COLUMN department_id VARCHAR(36) NULL AFTER position;

-- Saisons : direction optionnelle (NULL = global)
ALTER TABLE seasons ADD COLUMN department_id VARCHAR(36) NULL AFTER status;

-- Types d'activités : flag global (existants = globaux par défaut)
ALTER TABLE activity_types ADD COLUMN is_global TINYINT(1) NOT NULL DEFAULT 1;

-- Liaison types d'activités ↔ directions
CREATE TABLE IF NOT EXISTS activity_type_departments (
  activity_type_id VARCHAR(36) NOT NULL,
  department_id    VARCHAR(36) NOT NULL,
  PRIMARY KEY (activity_type_id, department_id),
  FOREIGN KEY (activity_type_id) REFERENCES activity_types(id)  ON DELETE CASCADE,
  FOREIGN KEY (department_id)    REFERENCES departments(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
