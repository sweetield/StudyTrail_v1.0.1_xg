import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth, requireStudent } from "../lib/session";
import { HttpError, dateStr, int, str, url } from "../lib/validate";
import { bindLogFiles, deleteStoredObjects, detachLogFiles, fileKeysForLog } from "../lib/storage";
import { STUDENT_VISIBLE } from "../lib/audience";
import { buildStudentMarkdown, parseTaskIds } from "../lib/markdown";

export const studentRoutes = new Hono<AppEnv>();
studentRoutes.use("*", requireAuth, requireStudent);

const VISIBLE = STUDENT_VISIBLE;

type TaskRow = { id: number; require_review: number; step_count: number };
type ProgressRow = { status: string; percent: number };

function groupBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<unknown, T[]> {
  const map = new Map<unknown, T[]>();
  for (const row of rows) {
    const k = row[key];
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

async function loadVisibleTask(c: { env: AppEnv["Bindings"] }, taskId: number, user: { id: number; class_id: number | null }) {
  const task = await c.env.DB.prepare(
    `SELECT t.id, t.require_review, (SELECT COUNT(*) FROM task_steps s WHERE s.task_id = t.id) AS step_count
       FROM tasks t WHERE t.id = ?3 AND ${VISIBLE}`,
  )
    .bind(user.id, user.class_id, taskId)
    .first<TaskRow>();
  if (!task) throw new HttpError(404, "任务不存在或未发布");
  return task;
}

type TaskContext = TaskRow & { checked: number; step_ok: number; progress: ProgressRow | null };

// 一次往返取回任务、步骤勾选数与当前进度，减少写操作前的串行查询
async function loadTaskContext(
  c: { env: AppEnv["Bindings"] },
  taskId: number,
  user: { id: number; class_id: number | null },
  stepId = 0,
): Promise<TaskContext> {
  const db = c.env.DB;
  const [taskRes, progressRes] = await db.batch([
    db.prepare(
      `SELECT t.id, t.require_review,
              (SELECT COUNT(*) FROM task_steps s WHERE s.task_id = t.id) AS step_count,
              (SELECT COUNT(*) FROM step_checks sc WHERE sc.task_id = t.id AND sc.user_id = ?1) AS checked,
              EXISTS (SELECT 1 FROM task_steps s WHERE s.id = ?4 AND s.task_id = t.id) AS step_ok
         FROM tasks t
        WHERE t.id = ?2 AND t.status = 'published'
          AND (
            NOT EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = t.id)
            OR EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = t.id AND tc.class_id = ?3)
          )
          AND NOT EXISTS (SELECT 1 FROM task_exclusions te WHERE te.task_id = t.id AND te.user_id = ?1)`,
    ).bind(user.id, taskId, user.class_id, stepId),
    db.prepare("SELECT status, percent FROM progress WHERE task_id = ? AND user_id = ?").bind(taskId, user.id),
  ]);
  const task = taskRes.results[0] as (TaskRow & { checked: number; step_ok: number }) | undefined;
  if (!task) throw new HttpError(404, "任务不存在或未发布");
  return { ...task, progress: (progressRes.results[0] as ProgressRow | undefined) ?? null };
}

function assertEditable(p: ProgressRow | null) {
  if (p && (p.status === "submitted" || p.status === "approved")) {
    throw new HttpError(409, p.status === "approved" ? "任务已完成，无法修改" : "已提交审核，如需修改请先撤回");
  }
}

/** 学习日志在辅导员留言或产生更新日志后锁定，管理员仍可修改 */
function assertLogEditable(log: { has_reply: number; has_newer: number }) {
  if (log.has_reply) throw new HttpError(409, "辅导员已留言，这条日志不能再修改");
  if (log.has_newer) throw new HttpError(409, "已有更新的学习日志，以往的日志不能再修改");
}

studentRoutes.get("/tasks", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.tech_tags, t.due_date, t.require_review, t.priority, t.created_at,
            (SELECT COUNT(*) FROM task_steps s WHERE s.task_id = t.id) AS step_count,
            (SELECT ue.due_at FROM task_urges ue
              WHERE ue.task_id = t.id AND ue.user_id = ?1
              ORDER BY ue.due_at DESC, ue.id DESC LIMIT 1) AS urge_due_at,
            (SELECT ue.message FROM task_urges ue
              WHERE ue.task_id = t.id AND ue.user_id = ?1
              ORDER BY ue.due_at DESC, ue.id DESC LIMIT 1) AS urge_message,
            p.status, COALESCE(p.percent, 0) AS percent, p.updated_at, p.review_comment, p.score
       FROM tasks t
       LEFT JOIN progress p ON p.task_id = t.id AND p.user_id = ?1
      WHERE ${VISIBLE}
      ORDER BY t.priority DESC,
               CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END,
               t.due_date IS NULL, t.due_date, t.id DESC`,
  )
    .bind(user.id, user.class_id)
    .all();
  return c.json({ tasks: results });
});

studentRoutes.get("/tasks/:id", async (c) => {
  const user = c.get("user");
  const id = int(c.req.param("id"), "任务ID")!;
  const [taskRes, stepsRes, progressRes, logsRes, eventsRes, filesRes, logFilesRes, repliesRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT t.id, t.title, t.description, t.tech_tags, t.due_date, t.require_review, t.priority, t.created_at,
              (SELECT ue.due_at FROM task_urges ue
                WHERE ue.task_id = t.id AND ue.user_id = ?1
                ORDER BY ue.due_at DESC, ue.id DESC LIMIT 1) AS urge_due_at,
              (SELECT ue.message FROM task_urges ue
                WHERE ue.task_id = t.id AND ue.user_id = ?1
                ORDER BY ue.due_at DESC, ue.id DESC LIMIT 1) AS urge_message
         FROM tasks t WHERE t.id = ?3 AND ${VISIBLE}`,
    ).bind(user.id, user.class_id, id),
    c.env.DB.prepare(
      `SELECT s.id, s.title, s.position, (sc.step_id IS NOT NULL) AS done
         FROM task_steps s
         LEFT JOIN step_checks sc ON sc.step_id = s.id AND sc.user_id = ?
        WHERE s.task_id = ? ORDER BY s.position, s.id`,
    ).bind(user.id, id),
    c.env.DB.prepare("SELECT * FROM progress WHERE task_id = ? AND user_id = ?").bind(id, user.id),
    c.env.DB.prepare(
      `SELECT l.id, l.minutes, l.content, l.log_date, l.created_at,
              CASE WHEN NOT EXISTS (SELECT 1 FROM log_replies r WHERE r.log_id = l.id)
                     AND NOT EXISTS (SELECT 1 FROM study_logs n WHERE n.user_id = l.user_id AND n.id > l.id)
                   THEN 1 ELSE 0 END AS editable
         FROM study_logs l WHERE l.user_id = ? AND l.task_id = ? ORDER BY l.log_date DESC, l.id DESC LIMIT 50`,
    ).bind(user.id, id),
    c.env.DB.prepare(
      `SELECT e.id, e.action, e.comment, e.score, e.created_at, a.name AS actor_name
         FROM progress_events e LEFT JOIN users a ON a.id = e.actor_id
        WHERE e.task_id = ? AND e.user_id = ? ORDER BY e.id DESC LIMIT 50`,
    ).bind(id, user.id),
    c.env.DB.prepare(
      `SELECT id, name, mime, size, created_at FROM files
        WHERE scope = 'progress' AND task_id = ? AND owner_user_id = ? ORDER BY created_at, id`,
    ).bind(id, user.id),
    c.env.DB.prepare(
      `SELECT f.id, f.log_id, f.name, f.mime, f.size, f.created_at
         FROM files f JOIN study_logs l ON l.id = f.log_id
        WHERE l.user_id = ? AND l.task_id = ? ORDER BY f.created_at, f.id`,
    ).bind(user.id, id),
    c.env.DB.prepare(
      `SELECT r.id, r.log_id, r.content, r.created_at, u.name AS author_name
         FROM log_replies r JOIN users u ON u.id = r.user_id JOIN study_logs l ON l.id = r.log_id
        WHERE l.user_id = ? AND l.task_id = ? ORDER BY r.id`,
    ).bind(user.id, id),
  ]);
  const task = taskRes.results[0];
  if (!task) throw new HttpError(404, "任务不存在或未发布");
  const logFiles = groupBy(logFilesRes.results as Record<string, unknown>[], "log_id");
  const replies = groupBy(repliesRes.results as Record<string, unknown>[], "log_id");
  const logs = logsRes.results.map((log: any) => ({
    ...log,
    editable: !!log.editable,
    files: logFiles.get(log.id) ?? [],
    replies: replies.get(log.id) ?? [],
  }));
  return c.json({
    task,
    steps: stepsRes.results.map((s: any) => ({ ...s, done: !!s.done })),
    progress: progressRes.results[0] ?? null,
    files: filesRes.results,
    logs,
    events: eventsRes.results,
  });
});

studentRoutes.put("/tasks/:id/steps/:stepId", async (c) => {
  const user = c.get("user");
  const taskId = int(c.req.param("id"), "任务ID")!;
  const stepId = int(c.req.param("stepId"), "步骤ID")!;
  const { done } = await c.req.json<{ done: boolean }>();
  const task = await loadTaskContext(c, taskId, user, stepId);
  if (!task.step_ok) throw new HttpError(404, "步骤不存在");
  assertEditable(task.progress);

  const toggle = done
    ? c.env.DB.prepare("INSERT OR IGNORE INTO step_checks (user_id, step_id, task_id) VALUES (?, ?, ?)").bind(user.id, stepId, taskId)
    : c.env.DB.prepare("DELETE FROM step_checks WHERE user_id = ? AND step_id = ?").bind(user.id, stepId);

  const results = await c.env.DB.batch([
    toggle,
    c.env.DB.prepare(
      `INSERT INTO progress (task_id, user_id, status, percent, updated_at)
       VALUES (?1, ?2, 'doing', (SELECT CAST(COUNT(*) * 100 / CAST(?3 AS INTEGER) AS INTEGER) FROM step_checks WHERE task_id = ?1 AND user_id = ?2), unixepoch())
       ON CONFLICT (task_id, user_id) DO UPDATE SET
         status = CASE WHEN status = 'rejected' THEN 'rejected' ELSE 'doing' END,
         percent = excluded.percent, updated_at = unixepoch()
       RETURNING status, percent`,
    ).bind(taskId, user.id, task.step_count || 1),
  ]);
  return c.json({ progress: results[1].results[0] });
});

studentRoutes.put("/tasks/:id/progress", async (c) => {
  const user = c.get("user");
  const taskId = int(c.req.param("id"), "任务ID")!;
  const body = await c.req.json();
  const task = await loadTaskContext(c, taskId, user);
  assertEditable(task.progress);

  const note = str(body.note, "学习笔记", { optional: true, max: 2000 });
  const link = url(body.link);
  const manualPercent = task.step_count === 0 ? int(body.percent, "进度", { min: 0, max: 100, optional: true }) : null;

  const row = await c.env.DB.prepare(
    `INSERT INTO progress (task_id, user_id, status, percent, note, link, updated_at)
     VALUES (?1, ?2, 'doing', COALESCE(?3, 0), ?4, ?5, unixepoch())
     ON CONFLICT (task_id, user_id) DO UPDATE SET
       percent = COALESCE(?3, percent), note = ?4, link = ?5, updated_at = unixepoch()
     RETURNING *`,
  )
    .bind(taskId, user.id, manualPercent, note, link)
    .first();
  return c.json({ progress: row });
});

studentRoutes.post("/tasks/:id/submit", async (c) => {
  const user = c.get("user");
  const taskId = int(c.req.param("id"), "任务ID")!;
  const task = await loadTaskContext(c, taskId, user);
  assertEditable(task.progress);
  if (task.checked < task.step_count) throw new HttpError(400, "请先完成所有学习步骤再提交");

  const status = task.require_review ? "submitted" : "approved";
  const row = await c.env.DB.prepare(
    `INSERT INTO progress (task_id, user_id, status, percent, submitted_at, reviewed_at, updated_at)
     VALUES (?1, ?2, ?3, 100, unixepoch(), CASE WHEN ?3 = 'approved' THEN unixepoch() END, unixepoch())
     ON CONFLICT (task_id, user_id) DO UPDATE SET
       status = ?3, percent = 100, score = NULL, reviewer_id = NULL, review_comment = '', submitted_at = unixepoch(),
       reviewed_at = CASE WHEN ?3 = 'approved' THEN unixepoch() ELSE NULL END,
       updated_at = unixepoch()
     RETURNING *`,
  )
    .bind(taskId, user.id, status)
    .first();
  return c.json({ progress: row });
});

studentRoutes.post("/tasks/:id/withdraw", async (c) => {
  const user = c.get("user");
  const taskId = int(c.req.param("id"), "任务ID")!;
  const row = await c.env.DB.prepare(
    `UPDATE progress SET status = 'doing', submitted_at = NULL, updated_at = unixepoch()
      WHERE task_id = ? AND user_id = ? AND status = 'submitted' RETURNING *`,
  )
    .bind(taskId, user.id)
    .first();
  if (!row) throw new HttpError(409, "当前状态无法撤回");
  return c.json({ progress: row });
});

/** 导出当前学员的学习进度为 Markdown，可一次选择多个任务 */
studentRoutes.get("/export", async (c) => {
  const user = c.get("user");
  const ids = parseTaskIds(c.req.query("task_ids"));
  const idFilter = ids.length ? ` AND t.id IN (${ids.map((_, i) => `?${i + 3}`).join(", ")})` : "";
  const { results: tasks } = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.description, t.tech_tags, t.due_date, t.require_review
       FROM tasks t
      WHERE ${VISIBLE}${idFilter}
      ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date, t.id DESC`,
  )
    .bind(user.id, user.class_id, ...ids)
    .all<{
      id: number;
      title: string;
      description: string;
      tech_tags: string;
      due_date: string | null;
      require_review: number;
    }>();

  const taskIds = tasks.map((task) => task.id);
  if (!taskIds.length) {
    const md = buildStudentMarkdown(user.name, []);
    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return c.body(md, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="study-trail-${stamp}.md"`,
    });
  }

  const inTasks = taskIds.map(() => "?").join(", ");
  const [stepsRes, progressRes, filesRes, logsRes, logFilesRes, repliesRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT s.task_id, s.title, (sc.step_id IS NOT NULL) AS done
         FROM task_steps s
         LEFT JOIN step_checks sc ON sc.step_id = s.id AND sc.user_id = ?
        WHERE s.task_id IN (${inTasks}) ORDER BY s.task_id, s.position, s.id`,
    ).bind(user.id, ...taskIds),
    c.env.DB.prepare(`SELECT * FROM progress WHERE user_id = ? AND task_id IN (${inTasks})`).bind(user.id, ...taskIds),
    c.env.DB.prepare(
      `SELECT id, task_id, name, mime, size FROM files
        WHERE scope = 'progress' AND owner_user_id = ? AND task_id IN (${inTasks})
        ORDER BY created_at, id`,
    ).bind(user.id, ...taskIds),
    c.env.DB.prepare(
      `SELECT id, task_id, minutes, content, log_date FROM study_logs
        WHERE user_id = ? AND task_id IN (${inTasks})
        ORDER BY log_date DESC, id DESC`,
    ).bind(user.id, ...taskIds),
    c.env.DB.prepare(
      `SELECT f.id, f.log_id, f.name, f.mime, f.size
         FROM files f JOIN study_logs l ON l.id = f.log_id
        WHERE l.user_id = ? AND l.task_id IN (${inTasks}) ORDER BY f.created_at, f.id`,
    ).bind(user.id, ...taskIds),
    c.env.DB.prepare(
      `SELECT r.id, r.log_id, r.content, r.created_at, u.name AS author_name
         FROM log_replies r JOIN users u ON u.id = r.user_id JOIN study_logs l ON l.id = r.log_id
        WHERE l.user_id = ? AND l.task_id IN (${inTasks}) ORDER BY r.id`,
    ).bind(user.id, ...taskIds),
  ]);

  const stepMap = groupBy(stepsRes.results as Record<string, unknown>[], "task_id");
  const progressMap = new Map((progressRes.results as any[]).map((row) => [row.task_id, row]));
  const fileMap = groupBy(filesRes.results as Record<string, unknown>[], "task_id");
  const logMap = groupBy(logsRes.results as Record<string, unknown>[], "task_id");
  const logFileMap = groupBy(logFilesRes.results as Record<string, unknown>[], "log_id");
  const replyMap = groupBy(repliesRes.results as Record<string, unknown>[], "log_id");

  const md = buildStudentMarkdown(
    user.name,
    tasks.map((task) => ({
      ...task,
      steps: (stepMap.get(task.id) ?? []).map((step: any) => ({ title: step.title, done: !!step.done })),
      progress: (progressMap.get(task.id) as any) ?? null,
      files: (fileMap.get(task.id) ?? []) as any,
      logs: (logMap.get(task.id) ?? []).map((log: any) => ({
        ...log,
        files: (logFileMap.get(log.id) ?? []) as any,
        replies: (replyMap.get(log.id) ?? []) as any,
      })),
    })),
  );

  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return c.body(md, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="study-trail-${stamp}.md"`,
  });
});

studentRoutes.get("/logs", async (c) => {
  const user = c.get("user");
  const [logs, daily, files, replies] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT l.id, l.minutes, l.content, l.log_date, l.created_at, l.task_id, t.title AS task_title,
              CASE WHEN NOT EXISTS (SELECT 1 FROM log_replies r WHERE r.log_id = l.id)
                     AND NOT EXISTS (SELECT 1 FROM study_logs n WHERE n.user_id = l.user_id AND n.id > l.id)
                   THEN 1 ELSE 0 END AS editable
         FROM study_logs l LEFT JOIN tasks t ON t.id = l.task_id
        WHERE l.user_id = ? ORDER BY l.log_date DESC, l.id DESC LIMIT 100`,
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT log_date, SUM(minutes) AS minutes, COUNT(*) AS count
         FROM study_logs WHERE user_id = ? GROUP BY log_date ORDER BY log_date DESC LIMIT 90`,
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT f.id, f.log_id, f.name, f.mime, f.size, f.created_at
         FROM files f JOIN study_logs l ON l.id = f.log_id
        WHERE l.user_id = ? ORDER BY f.created_at, f.id`,
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT r.id, r.log_id, r.content, r.created_at, u.name AS author_name
         FROM log_replies r JOIN users u ON u.id = r.user_id JOIN study_logs l ON l.id = r.log_id
        WHERE l.user_id = ? ORDER BY r.id`,
    ).bind(user.id),
  ]);
  const logFiles = groupBy(files.results as Record<string, unknown>[], "log_id");
  const logReplies = groupBy(replies.results as Record<string, unknown>[], "log_id");
  return c.json({
    logs: logs.results.map((log: any) => ({
      ...log,
      editable: !!log.editable,
      files: logFiles.get(log.id) ?? [],
      replies: logReplies.get(log.id) ?? [],
    })),
    daily: daily.results,
  });
});

studentRoutes.post("/logs", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const content = str(body.content, "学习内容", { max: 2000 });
  const minutes = int(body.minutes, "学习时长", { min: 0, max: 1440 })!;
  const logDate = dateStr(body.log_date, "日期", false)!;
  const taskId = int(body.task_id, "关联任务", { min: 1, optional: true });
  if (taskId) await loadVisibleTask(c, taskId, user);
  const row = await c.env.DB.prepare(
    "INSERT INTO study_logs (user_id, task_id, minutes, content, log_date) VALUES (?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(user.id, taskId, minutes, content, logDate)
    .first<{ id: number }>();
  try {
    await bindLogFiles(c.env, user.id, row!.id, body.file_ids);
  } catch (err) {
    await c.env.DB.prepare("DELETE FROM study_logs WHERE id = ? AND user_id = ?").bind(row!.id, user.id).run();
    throw err;
  }
  return c.json({ log: row });
});

studentRoutes.patch("/logs/:id", async (c) => {
  const user = c.get("user");
  const id = int(c.req.param("id"), "日志ID")!;
  const body = await c.req.json();
  const content = str(body.content, "学习内容", { max: 2000 });
  const minutes = int(body.minutes, "学习时长", { min: 0, max: 1440 })!;
  const logDate = dateStr(body.log_date, "日期", false)!;
  const taskId = int(body.task_id, "关联任务", { min: 1, optional: true });
  const existing = await c.env.DB.prepare(
    `SELECT l.task_id,
            EXISTS (SELECT 1 FROM log_replies r WHERE r.log_id = l.id) AS has_reply,
            EXISTS (SELECT 1 FROM study_logs n WHERE n.user_id = l.user_id AND n.id > l.id) AS has_newer
       FROM study_logs l WHERE l.id = ? AND l.user_id = ?`,
  )
    .bind(id, user.id)
    .first<{ task_id: number | null; has_reply: number; has_newer: number }>();
  if (!existing) throw new HttpError(404, "日志不存在");
  assertLogEditable(existing);
  if (taskId && taskId !== existing.task_id) await loadVisibleTask(c, taskId, user);
  const row = await c.env.DB.prepare(
    "UPDATE study_logs SET content = ?, minutes = ?, log_date = ?, task_id = ? WHERE id = ? AND user_id = ? RETURNING id",
  )
    .bind(content, minutes, logDate, taskId, id, user.id)
    .first();
  if (!row) throw new HttpError(404, "日志不存在");
  await detachLogFiles(c.env, user.id, id, body.remove_file_ids);
  await bindLogFiles(c.env, user.id, id, body.file_ids);
  return c.json({ log: row });
});

studentRoutes.delete("/logs/:id", async (c) => {
  const user = c.get("user");
  const id = int(c.req.param("id"), "日志ID")!;
  const log = await c.env.DB.prepare(
    `SELECT l.id,
            EXISTS (SELECT 1 FROM log_replies r WHERE r.log_id = l.id) AS has_reply,
            EXISTS (SELECT 1 FROM study_logs n WHERE n.user_id = l.user_id AND n.id > l.id) AS has_newer
       FROM study_logs l WHERE l.id = ? AND l.user_id = ?`,
  )
    .bind(id, user.id)
    .first<{ id: number; has_reply: number; has_newer: number }>();
  if (!log) throw new HttpError(404, "日志不存在");
  assertLogEditable(log);
  const keys = await fileKeysForLog(c.env, id);
  await c.env.DB.prepare("DELETE FROM study_logs WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  await deleteStoredObjects(c.env, keys);
  return c.json({ ok: true });
});
