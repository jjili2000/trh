-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : User Modules, Default Positions, Validation Config
-- Compatible MySQL 5.7+
-- Run once against your database
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Modify role ENUM to only include admin/user
--    (converts existing manager/treasurer → user first)
UPDATE users SET role = 'user' WHERE role IN ('manager', 'treasurer');
ALTER TABLE users MODIFY COLUMN role ENUM('admin','user') NOT NULL DEFAULT 'user';

-- 2. Add is_protected column to positions
--    (remove this line if column already exists)
ALTER TABLE positions ADD COLUMN is_protected TINYINT(1) NOT NULL DEFAULT 0;

-- 3. Insert default positions (skip any whose name already exists)
INSERT INTO positions (id, name, is_protected)
SELECT UUID(), v.name, v.ip FROM (
  SELECT 'Président'                    AS name, 1 AS ip UNION ALL
  SELECT 'Vice-président',                        0      UNION ALL
  SELECT 'Trésorier',                             1      UNION ALL
  SELECT 'Secrétaire Général',                    1      UNION ALL
  SELECT 'Trésorier adjoint',                     0      UNION ALL
  SELECT 'Secrétaire Général adjoint',             0      UNION ALL
  SELECT 'Membre du comité',                      0      UNION ALL
  SELECT 'Bénévole',                              0      UNION ALL
  SELECT 'Responsable Permanence',                0      UNION ALL
  SELECT 'Permanent',                             0      UNION ALL
  SELECT 'Directeur sportif',                     0      UNION ALL
  SELECT 'Entraîneur',                            0      UNION ALL
  SELECT 'Préparateur physique',                  0
) v
WHERE v.name NOT IN (SELECT name FROM positions);

-- Mark existing protected posts (in case they were already in the table)
UPDATE positions SET is_protected = 1
WHERE name IN ('Président', 'Trésorier', 'Secrétaire Général');

-- 4. Create user_module_access table
CREATE TABLE IF NOT EXISTS user_module_access (
  user_id VARCHAR(36) NOT NULL,
  module  VARCHAR(50) NOT NULL,
  PRIMARY KEY (user_id, module),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Seed default module access for all existing users
INSERT IGNORE INTO user_module_access (user_id, module)
SELECT id, 'time'      FROM users;
INSERT IGNORE INTO user_module_access (user_id, module)
SELECT id, 'absences'  FROM users;
INSERT IGNORE INTO user_module_access (user_id, module)
SELECT id, 'expenses'  FROM users;
INSERT IGNORE INTO user_module_access (user_id, module)
SELECT id, 'documents' FROM users;

-- 6. Validation config tables
CREATE TABLE IF NOT EXISTS validation_config (
  config_type VARCHAR(50) NOT NULL,
  mode        ENUM('AND','OR') NOT NULL DEFAULT 'OR',
  PRIMARY KEY (config_type)
);

CREATE TABLE IF NOT EXISTS validation_config_positions (
  id            VARCHAR(36)  NOT NULL,
  config_type   VARCHAR(50)  NOT NULL,
  position_name VARCHAR(200) NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (config_type) REFERENCES validation_config(config_type) ON DELETE CASCADE
);

-- Seed initial config rows
INSERT IGNORE INTO validation_config (config_type, mode) VALUES ('budget',   'OR');
INSERT IGNORE INTO validation_config (config_type, mode) VALUES ('expenses', 'OR');
