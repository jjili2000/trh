-- Migration : déduplication des opérations bancaires par hash
-- À exécuter via phpMyAdmin sur trh_tennis
ALTER TABLE bank_operations
  ADD COLUMN operationHash VARCHAR(64) NULL AFTER ruleId;

CREATE INDEX idx_bank_operations_hash ON bank_operations(operationHash);
