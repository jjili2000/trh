-- ============================================================
--  Migration : suivi du coût IA (reconnaissance de documents)
--  À exécuter une seule fois sur la base de production.
-- ============================================================

-- Ajoute la colonne ai_model dans les paramètres de l'application
ALTER TABLE app_settings
  ADD COLUMN ai_model VARCHAR(100) NULL DEFAULT 'claude-opus-4-5';

-- Table de log des appels à l'API Anthropic
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id            VARCHAR(36)  PRIMARY KEY,
  called_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  function_type ENUM('recognize_expense', 'recognize_document') NOT NULL,
  model         VARCHAR(100) NOT NULL,
  input_tokens  INT          NOT NULL DEFAULT 0,
  output_tokens INT          NOT NULL DEFAULT 0,
  cost_usd      DECIMAL(12,8) NOT NULL DEFAULT 0,
  user_id       VARCHAR(36)  NULL,
  ref_id        VARCHAR(36)  NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
