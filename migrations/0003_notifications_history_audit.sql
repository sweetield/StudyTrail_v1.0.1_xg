-- 审核人：用于审核记录与通知
ALTER TABLE progress ADD COLUMN reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 站内通知
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at);

-- 提交 / 撤回 / 审核历史
CREATE TABLE IF NOT EXISTS progress_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('submit', 'withdraw', 'approve', 'reject')),
  comment TEXT NOT NULL DEFAULT '',
  score INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_events_task_user ON progress_events(task_id, user_id, id);

-- 管理操作审计
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- 状态流转自动写入历史，覆盖学员提交、撤回与辅导员审核所有入口
CREATE TRIGGER IF NOT EXISTS trg_progress_event_insert AFTER INSERT ON progress
WHEN NEW.status IN ('submitted', 'approved')
BEGIN
  INSERT INTO progress_events (task_id, user_id, action, actor_id)
  VALUES (NEW.task_id, NEW.user_id, CASE NEW.status WHEN 'submitted' THEN 'submit' ELSE 'approve' END, NEW.user_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_progress_event_update AFTER UPDATE OF status ON progress
WHEN OLD.status IS NOT NEW.status AND (NEW.status <> 'doing' OR OLD.status = 'submitted')
BEGIN
  INSERT INTO progress_events (task_id, user_id, action, comment, score, actor_id)
  VALUES (
    NEW.task_id,
    NEW.user_id,
    CASE NEW.status WHEN 'submitted' THEN 'submit' WHEN 'approved' THEN 'approve' WHEN 'rejected' THEN 'reject' ELSE 'withdraw' END,
    CASE WHEN NEW.status IN ('approved', 'rejected') THEN NEW.review_comment ELSE '' END,
    CASE WHEN NEW.status = 'approved' THEN NEW.score END,
    CASE WHEN NEW.status IN ('approved', 'rejected') THEN COALESCE(NEW.reviewer_id, NEW.user_id) ELSE NEW.user_id END
  );
END;

-- 学员提交后通知所有在职辅导员
CREATE TRIGGER IF NOT EXISTS trg_notify_submit_insert AFTER INSERT ON progress
WHEN NEW.status = 'submitted'
BEGIN
  INSERT INTO notifications (user_id, kind, title, link)
  SELECT a.id, 'submit', s.name || ' 提交了《' || t.title || '》，等待审核', '/admin/reviews'
    FROM users a, users s, tasks t
   WHERE a.role = 'admin' AND a.active = 1 AND s.id = NEW.user_id AND t.id = NEW.task_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_submit_update AFTER UPDATE OF status ON progress
WHEN NEW.status = 'submitted' AND OLD.status IS NOT 'submitted'
BEGIN
  INSERT INTO notifications (user_id, kind, title, link)
  SELECT a.id, 'submit', s.name || ' 提交了《' || t.title || '》，等待审核', '/admin/reviews'
    FROM users a, users s, tasks t
   WHERE a.role = 'admin' AND a.active = 1 AND s.id = NEW.user_id AND t.id = NEW.task_id;
END;

-- 审核结果通知学员（无需审核的自动通过不通知）
CREATE TRIGGER IF NOT EXISTS trg_notify_review AFTER UPDATE OF status ON progress
WHEN OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected')
BEGIN
  INSERT INTO notifications (user_id, kind, title, link)
  SELECT NEW.user_id,
         CASE NEW.status WHEN 'approved' THEN 'approve' ELSE 'reject' END,
         CASE NEW.status WHEN 'approved' THEN '《' || t.title || '》已通过审核' ELSE '《' || t.title || '》被退回，请查看评语后修改' END,
         '/app/tasks/' || NEW.task_id
    FROM tasks t WHERE t.id = NEW.task_id;
END;

-- 任务发布后通知对应学员
CREATE TRIGGER IF NOT EXISTS trg_notify_task_insert AFTER INSERT ON tasks
WHEN NEW.status = 'published'
BEGIN
  INSERT INTO notifications (user_id, kind, title, link)
  SELECT u.id, 'task', '新任务：《' || NEW.title || '》', '/app/tasks/' || NEW.id
    FROM users u
   WHERE u.role = 'student' AND u.active = 1 AND (NEW.class_id IS NULL OR NEW.class_id = u.class_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_task_publish AFTER UPDATE OF status ON tasks
WHEN NEW.status = 'published' AND OLD.status <> 'published'
BEGIN
  INSERT INTO notifications (user_id, kind, title, link)
  SELECT u.id, 'task', '新任务：《' || NEW.title || '》', '/app/tasks/' || NEW.id
    FROM users u
   WHERE u.role = 'student' AND u.active = 1 AND (NEW.class_id IS NULL OR NEW.class_id = u.class_id);
END;
