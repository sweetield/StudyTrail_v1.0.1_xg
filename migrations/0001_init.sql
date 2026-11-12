-- 班级 / 分组
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_users_role_class ON users(role, class_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tech_tags TEXT NOT NULL DEFAULT '',
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  require_review INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, class_id);

CREATE TABLE IF NOT EXISTS task_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_steps_task ON task_steps(task_id, position);

-- 学员在某任务上的进度（每人每任务一行）
CREATE TABLE IF NOT EXISTS progress (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'doing' CHECK (status IN ('doing', 'submitted', 'approved', 'rejected')),
  percent INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  review_comment TEXT NOT NULL DEFAULT '',
  submitted_at INTEGER,
  reviewed_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_status ON progress(status, submitted_at);

CREATE TABLE IF NOT EXISTS step_checks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL REFERENCES task_steps(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  checked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, step_id)
);
CREATE INDEX IF NOT EXISTS idx_checks_task_user ON step_checks(task_id, user_id);

-- 学习日志（每日打卡）
CREATE TABLE IF NOT EXISTS study_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  log_date TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_logs_user_date ON study_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created ON study_logs(created_at DESC);
