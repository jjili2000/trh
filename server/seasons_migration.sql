CREATE TABLE IF NOT EXISTS seasons (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,
  status      ENUM('draft','published','closed','deleted') NOT NULL DEFAULT 'draft',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS template_weeks (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  season_id   VARCHAR(36)  NOT NULL,
  label       VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS template_courses (
  id                VARCHAR(36)  NOT NULL PRIMARY KEY,
  template_week_id  VARCHAR(36)  NOT NULL,
  label             VARCHAR(100) NOT NULL,
  day_of_week       TINYINT      NOT NULL COMMENT '1=Lundi … 7=Dimanche',
  start_time        TIME         NOT NULL,
  end_time          TIME         NOT NULL,
  teacher_id        VARCHAR(36)  NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_week_id) REFERENCES template_weeks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS season_week_assignments (
  id                VARCHAR(36)  NOT NULL PRIMARY KEY,
  season_id         VARCHAR(36)  NOT NULL,
  template_week_id  VARCHAR(36)  NOT NULL,
  week_start_date   DATE         NOT NULL COMMENT 'Lundi de la semaine',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_season_week (season_id, week_start_date),
  FOREIGN KEY (season_id)        REFERENCES seasons(id)        ON DELETE CASCADE,
  FOREIGN KEY (template_week_id) REFERENCES template_weeks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
