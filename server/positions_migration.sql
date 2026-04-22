CREATE TABLE IF NOT EXISTS positions (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quelques postes de départ
INSERT IGNORE INTO positions (id, name) VALUES
  (UUID(), 'Moniteur'),
  (UUID(), 'Responsable pédagogique'),
  (UUID(), 'Directeur sportif'),
  (UUID(), 'Secrétaire'),
  (UUID(), 'Bénévole');
