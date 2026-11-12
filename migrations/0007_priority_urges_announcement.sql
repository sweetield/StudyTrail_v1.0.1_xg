-- 任务优先级：0 未设置，1 低，2 中，3 高
ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;

-- 管理员督促学员：记录本次督促的倒计时截止时间与说明
CREATE TABLE IF NOT EXISTS task_urges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL DEFAULT '',
  due_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_task_urges_user ON task_urges(user_id, task_id, due_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_urges_task ON task_urges(task_id, user_id, due_at DESC);

-- 全体通告：记录用户上次确认通告时的登录时间与通告更新时间，
-- 每次重新登录后都会再次提示，直到点击“我知道了”。
ALTER TABLE users ADD COLUMN announcement_seen_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN announcement_seen_login_at INTEGER NOT NULL DEFAULT 0;
