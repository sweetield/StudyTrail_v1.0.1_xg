-- 任务发布范围：支持同时选择多个班级，并可排除指定学员
-- task_classes 为空表示面向全部学员；有记录时仅面向这些班级。
CREATE TABLE IF NOT EXISTS task_classes (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_task_classes_class ON task_classes(class_id, task_id);

CREATE TABLE IF NOT EXISTS task_exclusions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_exclusions_user ON task_exclusions(user_id, task_id);

-- 兼容旧数据：原有单班级任务迁移到新的发布范围表
INSERT OR IGNORE INTO task_classes (task_id, class_id)
SELECT id, class_id FROM tasks WHERE class_id IS NOT NULL;

-- 用户头像：文件内容同样使用统一 AES-256-GCM 密钥加密，元数据单独保存，
-- 便于替换头像时删除旧对象。头像对所有已登录用户可见。
CREATE TABLE IF NOT EXISTS avatars (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  iv TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 任务发布通知改由应用层按发布范围（多班级 + 排除名单）发送，
-- 避免任务插入时发布范围尚未写入导致通知对象错误。
DROP TRIGGER IF EXISTS trg_notify_task_insert;
DROP TRIGGER IF EXISTS trg_notify_task_publish;
