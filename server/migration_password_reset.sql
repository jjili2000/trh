-- =============================================================================
-- Migration TRH — Tokens de réinitialisation de mot de passe
-- Compatible MySQL 5.7+
-- À exécuter UNE SEULE FOIS via phpMyAdmin sur la base trh_tennis
-- =============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  token       VARCHAR(64)  NOT NULL UNIQUE,
  expires_at  DATETIME     NOT NULL,
  used        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour accélerer la recherche par token
CREATE INDEX idx_prt_token ON password_reset_tokens(token);

-- =============================================================================
-- FIN DE LA MIGRATION
-- =============================================================================
