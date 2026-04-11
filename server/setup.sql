CREATE DATABASE IF NOT EXISTS trh_tennis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE trh_tennis;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','manager','user') NOT NULL DEFAULT 'user',
  manager_id VARCHAR(36),
  position VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS activity_types (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#2d6a4f'
);

CREATE TABLE IF NOT EXISTS time_entries (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  date DATE NOT NULL,
  hours DECIMAL(4,2) NOT NULL,
  activity_type_id VARCHAR(36),
  description TEXT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  validated_by VARCHAR(36),
  validated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_type_id) REFERENCES activity_types(id) ON DELETE SET NULL,
  FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS absence_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type ENUM('vacation','sick','personal','other') NOT NULL,
  reason TEXT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  validated_by VARCHAR(36),
  validated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  receipt_file LONGTEXT,
  receipt_file_name VARCHAR(255),
  receipt_file_type VARCHAR(100),
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  validated_by VARCHAR(36),
  validated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  club_name VARCHAR(100) DEFAULT 'Tennis Club'
);

INSERT IGNORE INTO app_settings (id, club_name) VALUES (1, 'Tennis Club');
