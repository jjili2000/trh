-- Migration : filtres enregistrés pour les opérations bancaires
-- À exécuter via phpMyAdmin sur trh_tennis

CREATE TABLE accounting_saved_filters (
  id        VARCHAR(36)  NOT NULL PRIMARY KEY,
  userId    VARCHAR(36)  NOT NULL,
  label     VARCHAR(255) NOT NULL,
  filters   JSON         NOT NULL,
  createdAt DATETIME     NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
