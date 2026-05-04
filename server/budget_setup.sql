-- Extend users role ENUM
ALTER TABLE users MODIFY COLUMN role ENUM('admin','manager','user','treasurer') NOT NULL DEFAULT 'user';

-- Budget requests
CREATE TABLE IF NOT EXISTS budget_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  comment TEXT,
  status ENUM('draft','submitted','approved','cancelled') DEFAULT 'draft',
  approver_id VARCHAR(36),
  approver_comment TEXT,
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Budget request lines (income/expense forecast)
CREATE TABLE IF NOT EXISTS budget_request_lines (
  id VARCHAR(36) PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL,
  type ENUM('income','expense') NOT NULL,
  label VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES budget_requests(id) ON DELETE CASCADE
);

-- Real budgets (created from approved requests)
CREATE TABLE IF NOT EXISTS real_budgets (
  id VARCHAR(36) PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('active','closed') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES budget_requests(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Real budget lines (copied from request + user-added)
CREATE TABLE IF NOT EXISTS real_budget_lines (
  id VARCHAR(36) PRIMARY KEY,
  real_budget_id VARCHAR(36) NOT NULL,
  source_line_id VARCHAR(36),
  type ENUM('income','expense') NOT NULL,
  label VARCHAR(255) NOT NULL,
  forecast_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (real_budget_id) REFERENCES real_budgets(id) ON DELETE CASCADE,
  FOREIGN KEY (source_line_id) REFERENCES budget_request_lines(id) ON DELETE SET NULL
);

-- Detail lines for real budget lines
CREATE TABLE IF NOT EXISTS budget_line_details (
  id VARCHAR(36) PRIMARY KEY,
  line_id VARCHAR(36) NOT NULL,
  detail_date DATE NOT NULL,
  label VARCHAR(255) NOT NULL,
  payment_method VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  receipt_file LONGTEXT,
  receipt_file_name VARCHAR(255),
  receipt_file_type VARCHAR(100),
  user_id VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (line_id) REFERENCES real_budget_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Access grants for real budgets
CREATE TABLE IF NOT EXISTS budget_access_grants (
  id VARCHAR(36) PRIMARY KEY,
  real_budget_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  granted_by VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_access (real_budget_id, user_id),
  FOREIGN KEY (real_budget_id) REFERENCES real_budgets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE
);

-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  ref_type VARCHAR(50),
  ref_id VARCHAR(36),
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
