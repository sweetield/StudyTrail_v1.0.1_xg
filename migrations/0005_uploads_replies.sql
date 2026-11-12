-- 应用级配置（如自动生成的文件加密密钥）
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 管理员对学习日志的留言 / 答疑
CREATE TABLE IF NOT EXISTS log_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER NOT NULL REFERENCES study_logs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_log_replies_log ON log_replies(log_id, id);

-- 上传文件元数据。文件内容以 AES-256-GCM 加密后存放在 R2。
-- scope = log      ：学习日志附件，创建/编辑日志时通过 log_id 绑定
-- scope = progress ：任务作品附件，上传时即绑定 task_id + owner_user_id
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('log', 'progress')),
  log_id INTEGER REFERENCES study_logs(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  iv TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_files_log ON files(log_id);
CREATE INDEX IF NOT EXISTS idx_files_progress ON files(task_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_files_uploader ON files(uploader_id, created_at);

-- 管理员回复后通知日志作者
CREATE TRIGGER IF NOT EXISTS trg_notify_log_reply AFTER INSERT ON log_replies
WHEN (SELECT role FROM users WHERE id = NEW.user_id) = 'admin'
BEGIN
  INSERT INTO notifications (user_id, kind, title, link)
  SELECT l.user_id, 'reply', '辅导员回复了你的学习日志', '/app/logs'
    FROM study_logs l
   WHERE l.id = NEW.log_id AND l.user_id <> NEW.user_id;
END;
