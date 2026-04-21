USE trh_tennis;

CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(36) PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_data LONGTEXT NOT NULL,
  document_type VARCHAR(100),
  user_id VARCHAR(36),
  detected_employee_name VARCHAR(200),
  period_start DATE,
  period_end DATE,
  notes TEXT,
  status ENUM('pending_validation','validated') DEFAULT 'pending_validation',
  uploaded_by VARCHAR(36) NOT NULL,
  validated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);
