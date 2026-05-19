CREATE TABLE budget_audit_log (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  real_budget_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  action ENUM('add_line','delete_line','add_detail','update_detail','delete_detail') NOT NULL,
  line_label VARCHAR(255) NULL,
  detail_label VARCHAR(255) NULL,
  detail_amount DECIMAL(10,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bal_rb (real_budget_id),
  INDEX idx_bal_ca (created_at)
);
