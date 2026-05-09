-- Accounting module setup
-- Run this after the main database setup

CREATE TABLE IF NOT EXISTS bank_imports (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  userId VARCHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  importedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  operationCount INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_bank_imports_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bank_operations (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  importId VARCHAR(36) NOT NULL,
  operationDate DATE NOT NULL,
  direction ENUM('credit','debit') NOT NULL,
  paymentMethod ENUM('card','transfer','direct_debit','check','cash','other') NOT NULL DEFAULT 'other',
  amount DECIMAL(12,2) NOT NULL,
  rawLabel TEXT,
  thirdParty VARCHAR(500),
  blockMDT VARCHAR(500),
  blockLIB VARCHAR(500),
  blockMOTIF VARCHAR(500),
  blockRNF VARCHAR(500),
  category VARCHAR(255),
  categorySource ENUM('manual','rule','none') NOT NULL DEFAULT 'none',
  ruleId VARCHAR(36),
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bank_operations_import FOREIGN KEY (importId) REFERENCES bank_imports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounting_rules (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  userId VARCHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL,
  conditionOperator ENUM('AND','OR') NOT NULL DEFAULT 'AND',
  category VARCHAR(255) NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_accounting_rules_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounting_rule_conditions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ruleId VARCHAR(36) NOT NULL,
  field ENUM('rawLabel','thirdParty','blockMDT','blockLIB','blockMOTIF','blockRNF','paymentMethod','direction') NOT NULL,
  operator ENUM('contains','equals','startsWith','endsWith','notContains') NOT NULL,
  value VARCHAR(500) NOT NULL,
  CONSTRAINT fk_arc_rule FOREIGN KEY (ruleId) REFERENCES accounting_rules(id) ON DELETE CASCADE
);
