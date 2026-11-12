-- 已审核列表按审核时间倒序分页
CREATE INDEX IF NOT EXISTS idx_progress_reviewed ON progress(status, reviewed_at DESC);

-- 删除任务时 study_logs.task_id 置空，以及按任务汇总日志
CREATE INDEX IF NOT EXISTS idx_logs_task ON study_logs(task_id);

-- 定时清理旧通知
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
