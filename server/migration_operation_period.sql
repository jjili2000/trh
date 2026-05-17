-- Migration : periodId direct sur bank_operations (permet affectation par opération)
-- À exécuter via phpMyAdmin sur trh_tennis

ALTER TABLE bank_operations
  ADD COLUMN periodId VARCHAR(36) NULL AFTER importId,
  ADD FOREIGN KEY (periodId) REFERENCES accounting_periods(id) ON DELETE SET NULL;
