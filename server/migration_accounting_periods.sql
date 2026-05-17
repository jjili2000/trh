-- Migration : périodes comptables + stockage des fichiers importés
-- À exécuter via phpMyAdmin sur trh_tennis

-- Table des périodes comptables
CREATE TABLE accounting_periods (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  userId      VARCHAR(36)  NOT NULL,
  label       VARCHAR(255) NOT NULL,
  startDate   DATE         NOT NULL,
  endDate     DATE         NOT NULL,
  createdAt   DATETIME     NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Rattachement de l'import à une période + nom du fichier stocké
ALTER TABLE bank_imports
  ADD COLUMN periodId       VARCHAR(36)  NULL AFTER userId,
  ADD COLUMN storedFileName VARCHAR(500) NULL AFTER fileName,
  ADD FOREIGN KEY (periodId) REFERENCES accounting_periods(id) ON DELETE SET NULL;
