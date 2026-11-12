import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAdmin, requireAuth } from "../lib/session";
import { hashPassword } from "../lib/crypto";
import { audit } from "../lib/audit";
import { HttpError, dateStr, int, password, str, username } from "../lib/validate";
import {
  avatarKeysForUser,
  bindLogFiles,
  deleteStoredObjects,
  detachLogFiles,
  fileKeysForLog,
  fileKeysForTask,
  fileKeysForUser,
} from "../lib/storage";
import {
  audienceSql,
  audienceStatements,
  normalizeIdList,
  notifyTaskUsers,
  taskAudienceUserIds,
} from "../lib/audience";
import { buildAdminMarkdown, parseTaskIds } from "../lib/markdown";

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requireAuth, requireAdmin);

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

const ELIGIBLE = `u.role = 'student' AND u.active = 1 AND ${audienceSql("t", "u")}`;

function normalizeTags(value: unknown): string {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，\s]+/) : [];
  const tags = [...new Set(list.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12);
  if (tags.some((t) => t.length > 24)) throw new HttpError(400, "单个技术标签不能超过 24 个字符");
  return tags.join(",");
}

function normalizeSteps(value: unknown): { id?: number; title: string }[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 50) throw new HttpError(400, "学习步骤最多 50 个");
  return value
    .map((s) => (typeof s === "string" ? { title: s } : { id: s?.id ? Number(s.id) : undefined, title: String(s?.title ?? "") }))
    .map((s) => ({ ...s, title: s.title.trim() }))
    .filter((s) => s.title)
    .map((s) => {
      if (s.title.length > 200) throw new HttpError(400, "步骤标题不能超过 200 个字符");
      return s;
    });
}

/* ---------------- 概览 ---------------- */

adminRoutes.get("/overview", async (c) => {
  const db = c.env.DB;
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const [counts, assigned, taskStats, activity, leaders] = await db.batch([
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE role = 'student' AND active = 1) AS students,
         (SELECT COUNT(*) FROM tasks WHERE status = 'published') AS tasks,
         (SELECT COUNT(*) FROM progress p JOIN tasks t ON t.id = p.task_id WHERE p.status = 'submitted' AND t.status = 'published') AS pending,
         (SELECT COALESCE(SUM(minutes), 0) FROM study_logs WHERE created_at >= ?) AS week_minutes,
         (SELECT COUNT(DISTINCT user_id) FROM study_logs WHERE created_at >= ?) AS week_active`,
    ).bind(weekAgo, weekAgo),
    db.prepare(
      `SELECT COUNT(*) AS assigned, SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END) AS approved
         FROM tasks t JOIN users u ON ${ELIGIBLE}
         LEFT JOIN progress p ON p.task_id = t.id AND p.user_id = u.id
        WHERE t.status = 'published'`,
    ),
    db.prepare(
      `SELECT t.id, t.title, t.due_date, COUNT(u.id) AS assigned,
              SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN p.status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
              SUM(CASE WHEN p.status IN ('doing', 'rejected') THEN 1 ELSE 0 END) AS doing
         FROM tasks t JOIN users u ON ${ELIGIBLE}
         LEFT JOIN progress p ON p.task_id = t.id AND p.user_id = u.id
        WHERE t.status = 'published'
        GROUP BY t.id ORDER BY t.id DESC LIMIT 8`,
    ),
    db.prepare(
      `SELECT * FROM (
         SELECT 'progress' AS kind, p.updated_at AS at, u.name AS user_name, t.title AS task_title, p.status AS detail, p.percent AS extra
           FROM progress p JOIN users u ON u.id = p.user_id JOIN tasks t ON t.id = p.task_id
         UNION ALL
         SELECT 'log' AS kind, l.created_at AS at, u.name, t.title, l.content, l.minutes
           FROM study_logs l JOIN users u ON u.id = l.user_id LEFT JOIN tasks t ON t.id = l.task_id
       ) ORDER BY at DESC LIMIT 12`,
    ),
    db.prepare(
      `SELECT u.id, u.name, c.name AS class_name,
              (SELECT COUNT(*) FROM progress p JOIN tasks t ON t.id = p.task_id
                WHERE p.user_id = u.id AND p.status = 'approved' AND t.status = 'published'
                  AND ${audienceSql("t", "u")}) AS completed,
              (SELECT COALESCE(SUM(minutes), 0) FROM study_logs l WHERE l.user_id = u.id) AS minutes
         FROM users u LEFT JOIN classes c ON c.id = u.class_id
        WHERE u.role = 'student' AND u.active = 1
        ORDER BY completed DESC, minutes DESC LIMIT 5`,
    ),
  ]);
  return c.json({
    counts: counts.results[0],
    completion: assigned.results[0],
    tasks: taskStats.results,
    activity: activity.results,
    leaders: leaders.results,
  });
});

/* ---------------- 班级 ---------------- */

adminRoutes.get("/classes", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.created_at, (SELECT COUNT(*) FROM users u WHERE u.class_id = c.id AND u.role = 'student') AS student_count
       FROM classes c ORDER BY c.id`,
  ).all();
  return c.json({ classes: results });
});

adminRoutes.post("/classes", async (c) => {
  const body = await c.req.json();
  const name = str(body.name, "班级名称", { max: 40 });
  try {
    const row = await c.env.DB.prepare("INSERT INTO classes (name) VALUES (?) RETURNING id").bind(name).first();
    await audit(c, "新建班级", name).run();
    return c.json({ class: row });
  } catch {
    throw new HttpError(409, "班级名称已存在");
  }
});

adminRoutes.patch("/classes/:id", async (c) => {
  const id = int(c.req.param("id"), "班级ID")!;
  const name = str((await c.req.json()).name, "班级名称", { max: 40 });
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE classes SET name = ? WHERE id = ?").bind(name, id),
    audit(c, "重命名班级", `#${id} → ${name}`),
  ]);
  return c.json({ ok: true });
});

adminRoutes.delete("/classes/:id", async (c) => {
  const id = int(c.req.param("id"), "班级ID")!;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET class_id = NULL WHERE class_id = ?").bind(id),
    c.env.DB.prepare("UPDATE tasks SET class_id = NULL WHERE class_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM task_classes WHERE class_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(id),
    audit(c, "删除班级", `#${id}`),
  ]);
  return c.json({ ok: true });
});

/* ---------------- 学员 ---------------- */

adminRoutes.get("/students", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.name, u.class_id, c.name AS class_name, u.active, u.must_change_password,
            u.last_login_at, u.created_at,
            (SELECT a.id FROM avatars a WHERE a.user_id = u.id) AS avatar_id,
            (SELECT COUNT(*) FROM tasks t WHERE t.status = 'published' AND ${audienceSql("t", "u")}) AS assigned,
            (SELECT COUNT(*) FROM progress p JOIN tasks t ON t.id = p.task_id
              WHERE p.user_id = u.id AND p.status = 'approved' AND t.status = 'published'
                AND ${audienceSql("t", "u")}) AS completed,
            (SELECT COALESCE(SUM(minutes), 0) FROM study_logs l WHERE l.user_id = u.id) AS minutes,
            (SELECT MAX(at) FROM (SELECT MAX(updated_at) AS at FROM progress WHERE user_id = u.id
                                  UNION ALL SELECT MAX(created_at) FROM study_logs WHERE user_id = u.id)) AS last_active_at
       FROM users u LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role = 'student'
      ORDER BY u.active DESC, u.id DESC`,
  ).all();
  return c.json({ students: results });
});

adminRoutes.get("/students/:id", async (c) => {
  const id = int(c.req.param("id"), "学员ID")!;
  const db = c.env.DB;
  const [userRes, tasksRes, logsRes, filesRes, logFilesRes, repliesRes] = await db.batch([
    db.prepare(
      `SELECT u.id, u.username, u.name, u.class_id, c.name AS class_name, u.active, u.last_login_at, u.created_at,
              (SELECT a.id FROM avatars a WHERE a.user_id = u.id) AS avatar_id
         FROM users u LEFT JOIN classes c ON c.id = u.class_id WHERE u.id = ? AND u.role = 'student'`,
    ).bind(id),
    db.prepare(
      `SELECT t.id, t.title, t.due_date, p.status, COALESCE(p.percent, 0) AS percent, p.note, p.link, p.score, p.updated_at,
              (SELECT COUNT(*) FROM files f WHERE f.scope = 'progress' AND f.task_id = t.id AND f.owner_user_id = u.id) AS file_count
         FROM tasks t JOIN users u ON u.id = ? AND ${audienceSql("t", "u")}
         LEFT JOIN progress p ON p.task_id = t.id AND p.user_id = u.id
        WHERE t.status = 'published' ORDER BY t.id DESC`,
    ).bind(id),
    db.prepare(
      `SELECT l.id, l.minutes, l.content, l.log_date, l.task_id, t.title AS task_title
         FROM study_logs l LEFT JOIN tasks t ON t.id = l.task_id
        WHERE l.user_id = ? ORDER BY l.log_date DESC, l.id DESC LIMIT 200`,
    ).bind(id),
    db.prepare(
      `SELECT id, task_id, name, mime, size, created_at FROM files
        WHERE scope = 'progress' AND owner_user_id = ? ORDER BY created_at, id`,
    ).bind(id),
    db.prepare(
      `SELECT f.id, f.log_id, f.name, f.mime, f.size, f.created_at
         FROM files f JOIN study_logs l ON l.id = f.log_id
        WHERE l.user_id = ? ORDER BY f.created_at, f.id`,
    ).bind(id),
    db.prepare(
      `SELECT r.id, r.log_id, r.content, r.created_at, u.name AS author_name
         FROM log_replies r JOIN users u ON u.id = r.user_id JOIN study_logs l ON l.id = r.log_id
        WHERE l.user_id = ? ORDER BY r.id`,
    ).bind(id),
  ]);
  if (!userRes.results[0]) throw new HttpError(404, "学员不存在");
  const logFiles = groupBy(logFilesRes.results as Record<string, unknown>[], "log_id");
  const replies = groupBy(repliesRes.results as Record<string, unknown>[], "log_id");
  return c.json({
    student: userRes.results[0],
    tasks: tasksRes.results,
    files: filesRes.results,
    logs: logsRes.results.map((log: any) => ({
      ...log,
      files: logFiles.get(log.id) ?? [],
      replies: replies.get(log.id) ?? [],
    })),
  });
});

adminRoutes.post("/students", async (c) => {
  const body = await c.req.json();
  const u = username(body.username);
  const name = str(body.name, "姓名", { max: 32 });
  const classId = int(body.class_id, "班级", { optional: true });
  const hash = await hashPassword(password(body.password));
  try {
    const row = await c.env.DB.prepare(
      "INSERT INTO users (username, name, password_hash, role, class_id, must_change_password) VALUES (?, ?, ?, 'student', ?, 1) RETURNING id",
    )
      .bind(u, name, hash, classId)
      .first();
    await audit(c, "新增学员", `${name}（${u}）`).run();
    return c.json({ student: row });
  } catch {
    throw new HttpError(409, "用户名已存在");
  }
});

// 批量导入：所有新学员共享同一个初始密码，只需计算一次哈希，避免超出 Worker CPU 限制
adminRoutes.post("/students/batch", async (c) => {
  const body = await c.req.json();
  const classId = int(body.class_id, "班级", { optional: true });
  const hash = await hashPassword(password(body.password));
  const lines = String(body.lines ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new HttpError(400, "请至少输入一行学员信息");
  if (lines.length > 500) throw new HttpError(400, "单次最多导入 500 名学员");

  const rows = lines.map((line, i) => {
    const [rawUser, ...rest] = line.split(/[,，\t\s]+/);
    try {
      return { username: username(rawUser), name: str(rest.join(" ") || rawUser, "姓名", { max: 32 }) };
    } catch (e) {
      throw new HttpError(400, `第 ${i + 1} 行：${(e as Error).message}`);
    }
  });

  const results = await c.env.DB.batch(
    rows.map((r) =>
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO users (username, name, password_hash, role, class_id, must_change_password) VALUES (?, ?, ?, 'student', ?, 1)",
      ).bind(r.username, r.name, hash, classId),
    ),
  );
  const created = results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  if (created) await audit(c, "批量导入学员", `${created} 名`).run();
  return c.json({ created, skipped: rows.length - created });
});

adminRoutes.patch("/students/:id", async (c) => {
  const id = int(c.req.param("id"), "学员ID")!;
  const body = await c.req.json();
  const db = c.env.DB;
  const stmts: D1PreparedStatement[] = [];
  const student = await db.prepare("SELECT name, username FROM users WHERE id = ? AND role = 'student'").bind(id).first<{ name: string; username: string }>();
  if (!student) throw new HttpError(404, "学员不存在");
  const label = `${student.name}（${student.username}）`;

  if (body.name !== undefined) stmts.push(db.prepare("UPDATE users SET name = ? WHERE id = ? AND role = 'student'").bind(str(body.name, "姓名", { max: 32 }), id));
  if (body.class_id !== undefined) stmts.push(db.prepare("UPDATE users SET class_id = ? WHERE id = ? AND role = 'student'").bind(int(body.class_id, "班级", { optional: true }), id));
  if (body.active !== undefined) {
    stmts.push(db.prepare("UPDATE users SET active = ? WHERE id = ? AND role = 'student'").bind(body.active ? 1 : 0, id));
    if (!body.active) stmts.push(db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
    stmts.push(audit(c, body.active ? "启用学员" : "停用学员", label));
  }
  if (body.password !== undefined) {
    const hash = await hashPassword(password(body.password));
    stmts.push(
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = 0 WHERE id = ? AND role = 'student'").bind(hash, id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
      audit(c, "重置学员密码", label),
    );
  }
  if (body.class_id !== undefined || body.name !== undefined) stmts.push(audit(c, "编辑学员信息", label));
  if (stmts.length) await db.batch(stmts);
  return c.json({ ok: true });
});

adminRoutes.delete("/students/:id", async (c) => {
  const id = int(c.req.param("id"), "学员ID")!;
  const student = await c.env.DB.prepare("SELECT name, username FROM users WHERE id = ? AND role = 'student'").bind(id).first<{ name: string; username: string }>();
  if (!student) throw new HttpError(404, "学员不存在");
  const keys = await fileKeysForUser(c.env, id);
  const avatarKeys = await avatarKeysForUser(c.env, id);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").bind(id),
    audit(c, "删除学员", `${student.name}（${student.username}）`),
  ]);
  await deleteStoredObjects(c.env, [...keys, ...avatarKeys]);
  return c.json({ ok: true });
});

/* ---------------- 任务 ---------------- */

adminRoutes.get("/tasks", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.tech_tags, t.class_id, cl.name AS class_name,
            (SELECT GROUP_CONCAT(c.name, '、') FROM task_classes tc JOIN classes c ON c.id = tc.class_id WHERE tc.task_id = t.id) AS class_names,
            t.due_date, t.status, t.require_review, t.priority, t.created_at,
            (SELECT COUNT(*) FROM task_steps s WHERE s.task_id = t.id) AS step_count,
            COUNT(u.id) AS assigned,
            COALESCE(SUM(p.status = 'approved'), 0) AS approved,
            COALESCE(SUM(p.status = 'submitted'), 0) AS submitted,
            COALESCE(SUM(p.status IN ('doing', 'rejected')), 0) AS doing
       FROM tasks t LEFT JOIN classes cl ON cl.id = t.class_id
       LEFT JOIN users u ON ${ELIGIBLE}
       LEFT JOIN progress p ON p.task_id = t.id AND p.user_id = u.id
      GROUP BY t.id
      ORDER BY CASE t.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, t.priority DESC, t.id DESC`,
  ).all();
  return c.json({ tasks: results });
});

function parseTask(body: any) {
  const status = ["draft", "published", "archived"].includes(body.status) ? body.status : "published";
  const classIds = normalizeIdList(body.class_ids ?? (body.class_id ? [body.class_id] : []), "班级", 100);
  const excludedUserIds = normalizeIdList(body.excluded_user_ids, "排除学员", 2000);
  return {
    title: str(body.title, "任务标题", { max: 100 }),
    description: str(body.description, "任务说明", { optional: true, max: 10000 }),
    tech_tags: normalizeTags(body.tech_tags),
    class_id: classIds[0] ?? null,
    class_ids: classIds,
    excluded_user_ids: excludedUserIds,
    due_date: dateStr(body.due_date, "截止日期"),
    status,
    require_review: body.require_review === false || body.require_review === 0 ? 0 : 1,
    priority: int(body.priority, "优先级", { min: 0, max: 3, optional: true }) ?? 0,
    steps: normalizeSteps(body.steps),
  };
}

adminRoutes.post("/tasks", async (c) => {
  const t = parseTask(await c.req.json());
  const db = c.env.DB;
  const row = await db
    .prepare(
      `INSERT INTO tasks (title, description, tech_tags, class_id, due_date, status, require_review, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(t.title, t.description, t.tech_tags, t.class_id, t.due_date, t.status, t.require_review, t.priority)
    .first<{ id: number }>();
  await db.batch([
    ...t.steps.map((s, i) => db.prepare("INSERT INTO task_steps (task_id, title, position) VALUES (?, ?, ?)").bind(row!.id, s.title, i)),
    ...audienceStatements(db, row!.id, t.class_ids, t.excluded_user_ids),
    audit(c, "创建任务", t.title),
  ]);
  if (t.status === "published") {
    const userIds = await taskAudienceUserIds(c.env, row!.id);
    await notifyTaskUsers(c.env, userIds, `新任务：《${t.title}》`, row!.id);
  }
  return c.json({ task: row });
});

adminRoutes.get("/tasks/:id", async (c) => {
  const id = int(c.req.param("id"), "任务ID")!;
  const db = c.env.DB;
  const [taskRes, stepsRes, rosterRes, filesRes, classRes, excludedRes] = await db.batch([
    db.prepare(
      `SELECT t.*, cl.name AS class_name,
              (SELECT GROUP_CONCAT(c.name, '、') FROM task_classes tc JOIN classes c ON c.id = tc.class_id WHERE tc.task_id = t.id) AS class_names
         FROM tasks t LEFT JOIN classes cl ON cl.id = t.class_id WHERE t.id = ?`,
    ).bind(id),
    db.prepare("SELECT id, title, position FROM task_steps WHERE task_id = ? ORDER BY position, id").bind(id),
    db.prepare(
      `SELECT u.id AS user_id, u.name, u.username, cl.name AS class_name,
              (SELECT a.id FROM avatars a WHERE a.user_id = u.id) AS avatar_id,
              p.status, COALESCE(p.percent, 0) AS percent, p.note, p.link, p.review_comment, p.score, p.submitted_at, p.updated_at,
              (SELECT COUNT(*) FROM files f WHERE f.scope = 'progress' AND f.task_id = t.id AND f.owner_user_id = u.id) AS file_count,
              (SELECT ue.due_at FROM task_urges ue
                WHERE ue.task_id = t.id AND ue.user_id = u.id
                ORDER BY ue.due_at DESC, ue.id DESC LIMIT 1) AS urge_due_at,
              (SELECT ue.message FROM task_urges ue
                WHERE ue.task_id = t.id AND ue.user_id = u.id
                ORDER BY ue.due_at DESC, ue.id DESC LIMIT 1) AS urge_message
         FROM tasks t JOIN users u ON ${ELIGIBLE}
         LEFT JOIN classes cl ON cl.id = u.class_id
         LEFT JOIN progress p ON p.task_id = t.id AND p.user_id = u.id
        WHERE t.id = ?
        ORDER BY CASE p.status WHEN 'submitted' THEN 0 WHEN 'rejected' THEN 1 WHEN 'doing' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END,
                 COALESCE(p.percent, 0) DESC, u.id`,
    ).bind(id),
    db.prepare(
      `SELECT id, owner_user_id, name, mime, size, created_at FROM files
        WHERE scope = 'progress' AND task_id = ? ORDER BY created_at, id`,
    ).bind(id),
    db.prepare("SELECT class_id FROM task_classes WHERE task_id = ? ORDER BY class_id").bind(id),
    db.prepare("SELECT user_id FROM task_exclusions WHERE task_id = ? ORDER BY user_id").bind(id),
  ]);
  if (!taskRes.results[0]) throw new HttpError(404, "任务不存在");
  return c.json({
    task: taskRes.results[0],
    steps: stepsRes.results,
    roster: rosterRes.results,
    files: filesRes.results,
    class_ids: (classRes.results as { class_id: number }[]).map((row) => row.class_id),
    excluded_user_ids: (excludedRes.results as { user_id: number }[]).map((row) => row.user_id),
  });
});

adminRoutes.put("/tasks/:id", async (c) => {
  const id = int(c.req.param("id"), "任务ID")!;
  const t = parseTask(await c.req.json());
  const db = c.env.DB;
  const [found, existing] = await db.batch<{ id: number; status: string }>([
    db.prepare("SELECT id, status FROM tasks WHERE id = ?").bind(id),
    db.prepare("SELECT id FROM task_steps WHERE task_id = ?").bind(id),
  ]);
  const previous = found.results[0];
  if (!previous) throw new HttpError(404, "任务不存在");
  const oldAudience = previous.status === "published" ? new Set(await taskAudienceUserIds(c.env, id)) : new Set<number>();
  const existingIds = new Set(existing.results.map((r) => r.id));
  const keepIds = new Set(t.steps.filter((s) => s.id && existingIds.has(s.id)).map((s) => s.id!));

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE tasks SET title = ?, description = ?, tech_tags = ?, class_id = ?, due_date = ?, status = ?, require_review = ?, priority = ?, updated_at = unixepoch()
          WHERE id = ?`,
      )
      .bind(t.title, t.description, t.tech_tags, t.class_id, t.due_date, t.status, t.require_review, t.priority, id),
  ];
  for (const oldId of existingIds) {
    if (!keepIds.has(oldId)) stmts.push(db.prepare("DELETE FROM task_steps WHERE id = ?").bind(oldId));
  }
  t.steps.forEach((s, i) => {
    stmts.push(
      s.id && keepIds.has(s.id)
        ? db.prepare("UPDATE task_steps SET title = ?, position = ? WHERE id = ?").bind(s.title, i, s.id)
        : db.prepare("INSERT INTO task_steps (task_id, title, position) VALUES (?, ?, ?)").bind(id, s.title, i),
    );
  });
  if (t.steps.length) {
    stmts.push(
      db
        .prepare(
          `UPDATE progress SET percent = (SELECT CAST(COUNT(*) * 100 / CAST(?2 AS INTEGER) AS INTEGER) FROM step_checks sc WHERE sc.task_id = ?1 AND sc.user_id = progress.user_id)
            WHERE task_id = ?1 AND status IN ('doing', 'rejected')`,
        )
        .bind(id, t.steps.length),
    );
  }
  stmts.push(...audienceStatements(db, id, t.class_ids, t.excluded_user_ids));
  stmts.push(audit(c, "编辑任务", t.title));
  await db.batch(stmts);
  if (t.status === "published") {
    const nextAudience = await taskAudienceUserIds(c.env, id);
    const fresh = nextAudience.filter((userId) => !oldAudience.has(userId));
    await notifyTaskUsers(c.env, fresh, `新任务：《${t.title}》`, id);
  }
  return c.json({ ok: true });
});

adminRoutes.post("/tasks/:id/duplicate", async (c) => {
  const id = int(c.req.param("id"), "任务ID")!;
  const db = c.env.DB;
  const row = await db
    .prepare(
      `INSERT INTO tasks (title, description, tech_tags, class_id, due_date, status, require_review, priority)
       SELECT substr(title || '（副本）', 1, 100), description, tech_tags, class_id, NULL, 'draft', require_review, priority FROM tasks WHERE id = ?
       RETURNING id, title`,
    )
    .bind(id)
    .first<{ id: number; title: string }>();
  if (!row) throw new HttpError(404, "任务不存在");
  await db.batch([
    db.prepare("INSERT INTO task_steps (task_id, title, position) SELECT ?, title, position FROM task_steps WHERE task_id = ? ORDER BY position, id").bind(row.id, id),
    db.prepare("INSERT INTO task_classes (task_id, class_id) SELECT ?, class_id FROM task_classes WHERE task_id = ?").bind(row.id, id),
    db.prepare("INSERT INTO task_exclusions (task_id, user_id) SELECT ?, user_id FROM task_exclusions WHERE task_id = ?").bind(row.id, id),
    audit(c, "复制任务", row.title),
  ]);
  return c.json({ task: row });
});

adminRoutes.delete("/tasks/:id", async (c) => {
  const id = int(c.req.param("id"), "任务ID")!;
  const db = c.env.DB;
  const task = await db.prepare("SELECT title FROM tasks WHERE id = ?").bind(id).first<{ title: string }>();
  if (!task) throw new HttpError(404, "任务不存在");
  const keys = await fileKeysForTask(c.env, id);
  await db.batch([db.prepare("DELETE FROM tasks WHERE id = ?").bind(id), audit(c, "删除任务", task.title)]);
  await deleteStoredObjects(c.env, keys);
  return c.json({ ok: true });
});

/* ---------------- 督促学员 ---------------- */

adminRoutes.post("/tasks/:id/urge", async (c) => {
  const id = int(c.req.param("id"), "任务ID")!;
  const body = await c.req.json();
  const userIds = normalizeIdList(body.user_ids, "学员", 2000);
  if (!userIds.length) throw new HttpError(400, "请选择要督促的学员");
  const minutes = int(body.minutes, "倒计时", { min: 1, max: 60 * 24 * 30 })!;
  const message = str(body.message, "督促说明", { optional: true, max: 200 });

  const task = await c.env.DB.prepare("SELECT id, title FROM tasks WHERE id = ?")
    .bind(id)
    .first<{ id: number; title: string }>();
  if (!task) throw new HttpError(404, "任务不存在");

  const audience = new Set(await taskAudienceUserIds(c.env, id));
  const targets = userIds.filter((userId) => audience.has(userId));
  if (!targets.length) throw new HttpError(400, "所选学员不在该任务的发布范围内");

  const me = c.get("user");
  const dueAt = Math.floor(Date.now() / 1000) + minutes * 60;
  const link = `/app/tasks/${id}`;
  const title = message ? `辅导员督促你完成《${task.title}》：${message}` : `辅导员督促你尽快完成《${task.title}》`;
  for (let i = 0; i < targets.length; i += 25) {
    const chunk = targets.slice(i, i + 25);
    await c.env.DB.batch(
      chunk.flatMap((userId) => [
        c.env.DB.prepare("INSERT INTO task_urges (task_id, user_id, admin_id, message, due_at) VALUES (?, ?, ?, ?, ?)").bind(
          id,
          userId,
          me.id,
          message,
          dueAt,
        ),
        c.env.DB.prepare("INSERT INTO notifications (user_id, kind, title, link) VALUES (?, 'urge', ?, ?)").bind(userId, title, link),
      ]),
    );
  }
  await audit(c, "督促学员", `${task.title} · ${targets.length} 人 · ${minutes} 分钟`).run();
  return c.json({ count: targets.length, due_at: dueAt });
});

adminRoutes.delete("/tasks/:id/urge/:userId", async (c) => {
  const id = int(c.req.param("id"), "任务ID")!;
  const userId = int(c.req.param("userId"), "学员ID")!;
  await c.env.DB.prepare("DELETE FROM task_urges WHERE task_id = ? AND user_id = ?").bind(id, userId).run();
  await audit(c, "取消督促", `任务 #${id} · 学员 #${userId}`).run();
  return c.json({ ok: true });
});

/* ---------------- 全体通告 ---------------- */

adminRoutes.get("/announcement", async (c) => {
  const row = await c.env.DB.prepare("SELECT value, updated_at FROM app_settings WHERE key = 'announcement'")
    .first<{ value: string; updated_at: number }>();
  return c.json({ content: row?.value ?? "", updated_at: row?.updated_at ?? null });
});

adminRoutes.put("/announcement", async (c) => {
  const body = await c.req.json();
  const content = str(body.content, "通告内容", { optional: true, max: 20000 });
  if (content) {
    await c.env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('announcement', ?, unixepoch())
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind(content)
      .run();
  } else {
    await c.env.DB.prepare("DELETE FROM app_settings WHERE key = 'announcement'").run();
  }
  await audit(c, content ? "更新全体通告" : "清空全体通告", content ? `${content.length} 字` : "").run();
  const row = await c.env.DB.prepare("SELECT value, updated_at FROM app_settings WHERE key = 'announcement'")
    .first<{ value: string; updated_at: number }>();
  return c.json({ content: row?.value ?? "", updated_at: row?.updated_at ?? null });
});

/* ---------------- 审核 ---------------- */

adminRoutes.get("/reviews", async (c) => {
  const status = c.req.query("status") === "done" ? "done" : "pending";
  const where = status === "pending" ? "p.status = 'submitted'" : "p.status IN ('approved', 'rejected') AND p.reviewed_at IS NOT NULL";
  const { results } = await c.env.DB.prepare(
    `SELECT p.task_id, p.user_id, p.status, p.percent, p.note, p.link, p.review_comment, p.score, p.submitted_at, p.reviewed_at,
            u.name AS user_name, u.username, cl.name AS class_name, t.title AS task_title, t.tech_tags, r.name AS reviewer_name,
            (SELECT a.id FROM avatars a WHERE a.user_id = u.id) AS avatar_id,
            (SELECT COUNT(*) FROM progress_events e WHERE e.task_id = p.task_id AND e.user_id = p.user_id AND e.action = 'submit') AS attempts,
            (SELECT COUNT(*) FROM files f WHERE f.scope = 'progress' AND f.task_id = p.task_id AND f.owner_user_id = p.user_id) AS file_count
       FROM progress p
       LEFT JOIN users r ON r.id = p.reviewer_id
       JOIN users u ON u.id = p.user_id
       JOIN tasks t ON t.id = p.task_id
       LEFT JOIN classes cl ON cl.id = u.class_id
      WHERE ${where}
      ORDER BY ${status === "pending" ? "p.submitted_at ASC" : "p.reviewed_at DESC"} LIMIT 200`,
  ).all();
  return c.json({ reviews: results });
});

adminRoutes.post("/reviews", async (c) => {
  const body = await c.req.json();
  const action = body.action === "reject" ? "rejected" : "approved";
  const comment = str(body.comment, "评语", { optional: true, max: 1000 });
  const score = action === "approved" ? (int(body.score, "评分", { min: 1, max: 5, optional: true }) ?? null) : null;
  const items: { task_id: number; user_id: number }[] = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
  if (items.length === 0) throw new HttpError(400, "请选择要审核的记录");
  if (action === "rejected" && !comment) throw new HttpError(400, "退回时请填写原因，方便学员修改");
  const me = c.get("user");
  const results = await c.env.DB.batch(
    items.map((it) =>
      c.env.DB.prepare(
        `UPDATE progress SET status = ?, review_comment = ?, score = ?, reviewer_id = ?, reviewed_at = unixepoch(), updated_at = unixepoch()
          WHERE task_id = ? AND user_id = ? AND status = 'submitted' RETURNING task_id`,
      ).bind(action, comment, score, me.id, int(it.task_id, "任务ID"), int(it.user_id, "学员ID")),
    ),
  );
  const updated = results.reduce((n, r) => n + r.results.length, 0);
  if (updated) await audit(c, action === "approved" ? "审核通过" : "审核退回", `${updated} 条提交`).run();
  return c.json({ updated });
});

adminRoutes.get("/progress/:taskId/:userId/events", async (c) => {
  const taskId = int(c.req.param("taskId"), "任务ID")!;
  const userId = int(c.req.param("userId"), "学员ID")!;
  const { results } = await c.env.DB.prepare(
    `SELECT e.id, e.action, e.comment, e.score, e.created_at, a.name AS actor_name
       FROM progress_events e LEFT JOIN users a ON a.id = e.actor_id
      WHERE e.task_id = ? AND e.user_id = ? ORDER BY e.id DESC LIMIT 50`,
  )
    .bind(taskId, userId)
    .all();
  return c.json({ events: results });
});

adminRoutes.get("/progress/:taskId/:userId/files", async (c) => {
  const taskId = int(c.req.param("taskId"), "任务ID")!;
  const userId = int(c.req.param("userId"), "学员ID")!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, mime, size, created_at FROM files
      WHERE scope = 'progress' AND task_id = ? AND owner_user_id = ? ORDER BY created_at, id`,
  )
    .bind(taskId, userId)
    .all();
  return c.json({ files: results });
});

/* ---------------- 学习日志留言 / 答疑 ---------------- */

adminRoutes.get("/logs/:id/replies", async (c) => {
  const id = int(c.req.param("id"), "日志ID")!;
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.content, r.created_at, u.name AS author_name
       FROM log_replies r JOIN users u ON u.id = r.user_id
      WHERE r.log_id = ? ORDER BY r.id`,
  )
    .bind(id)
    .all();
  return c.json({ replies: results });
});

adminRoutes.post("/logs/:id/replies", async (c) => {
  const id = int(c.req.param("id"), "日志ID")!;
  const body = await c.req.json();
  const content = str(body.content, "回复内容", { max: 2000 });
  const log = await c.env.DB.prepare(
    `SELECT l.id, l.log_date, l.user_id, u.name AS user_name FROM study_logs l JOIN users u ON u.id = l.user_id WHERE l.id = ?`,
  )
    .bind(id)
    .first<{ id: number; log_date: string; user_id: number; user_name: string }>();
  if (!log) throw new HttpError(404, "日志不存在");
  const me = c.get("user");
  const row = await c.env.DB.prepare("INSERT INTO log_replies (log_id, user_id, content) VALUES (?, ?, ?) RETURNING id, created_at")
    .bind(id, me.id, content)
    .first<{ id: number; created_at: number }>();
  await audit(c, "回复学习日志", `${log.user_name} ${log.log_date}`).run();
  return c.json({ reply: { ...row!, content, author_name: me.name } });
});

/** 管理员编辑学员学习日志 */
adminRoutes.patch("/logs/:id", async (c) => {
  const id = int(c.req.param("id"), "日志ID")!;
  const body = await c.req.json();
  const content = str(body.content, "学习内容", { max: 2000 });
  const minutes = int(body.minutes, "学习时长", { min: 0, max: 1440 })!;
  const logDate = dateStr(body.log_date, "日期", false)!;
  const taskId = int(body.task_id, "关联任务", { min: 1, optional: true });

  const log = await c.env.DB.prepare("SELECT id, user_id, task_id FROM study_logs WHERE id = ?")
    .bind(id)
    .first<{ id: number; user_id: number; task_id: number | null }>();
  if (!log) throw new HttpError(404, "日志不存在");
  if (taskId && taskId !== log.task_id) {
    const visible = await c.env.DB.prepare(
      `SELECT t.id FROM tasks t JOIN users u ON u.id = ?
        WHERE t.id = ? AND t.status = 'published' AND ${audienceSql("t", "u")}`,
    )
      .bind(log.user_id, taskId)
      .first();
    if (!visible) throw new HttpError(400, "关联任务不存在或该学员不可见");
  }

  const row = await c.env.DB.prepare(
    "UPDATE study_logs SET content = ?, minutes = ?, log_date = ?, task_id = ? WHERE id = ? RETURNING id",
  )
    .bind(content, minutes, logDate, taskId, id)
    .first();
  if (!row) throw new HttpError(404, "日志不存在");
  await detachLogFiles(c.env, log.user_id, id, body.remove_file_ids);
  await bindLogFiles(c.env, log.user_id, id, body.file_ids);
  await audit(c, "编辑学员日志", `#${id}`).run();
  return c.json({ log: row });
});

/** 管理员删除学员学习日志（同时删除附件） */
adminRoutes.delete("/logs/:id", async (c) => {
  const id = int(c.req.param("id"), "日志ID")!;
  const log = await c.env.DB.prepare("SELECT id, user_id, log_date FROM study_logs WHERE id = ?")
    .bind(id)
    .first<{ id: number; user_id: number; log_date: string }>();
  if (!log) throw new HttpError(404, "日志不存在");
  const keys = await fileKeysForLog(c.env, id);
  await c.env.DB.prepare("DELETE FROM study_logs WHERE id = ?").bind(id).run();
  await deleteStoredObjects(c.env, keys);
  await audit(c, "删除学员日志", `#${id} ${log.log_date}`).run();
  return c.json({ ok: true });
});

/* ---------------- 学习进度导出 ---------------- */

adminRoutes.get("/export", async (c) => {
  const me = c.get("user");
  const ids = parseTaskIds(c.req.query("task_ids"));
  const classId = int(c.req.query("class_id"), "班级", { optional: true });
  const userId = int(c.req.query("user_id"), "学员", { optional: true });
  const idFilter = ids.length ? ` AND t.id IN (${ids.map((_, i) => `?${i + 1}`).join(", ")})` : "";
  const tasksStmt = c.env.DB.prepare(
    `SELECT t.id, t.title, t.description, t.tech_tags, t.due_date, t.status, t.require_review,
            (SELECT GROUP_CONCAT(c.name, '、') FROM task_classes tc JOIN classes c ON c.id = tc.class_id WHERE tc.task_id = t.id) AS class_names
       FROM tasks t
      WHERE 1 = 1${idFilter}
      ORDER BY CASE t.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, t.id DESC`,
  );
  const { results: tasks } = await (ids.length ? tasksStmt.bind(...ids) : tasksStmt).all<{
      id: number;
      title: string;
      description: string;
      tech_tags: string;
      due_date: string | null;
      status: string;
      require_review: number;
      class_names: string | null;
    }>();

  const taskIds = tasks.map((task) => task.id);
  const scopeLabel = classId ? `班级 #${classId}` : userId ? `学员 #${userId}` : "全部学员";
  if (!taskIds.length) {
    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return c.body(buildAdminMarkdown(me.name, [], scopeLabel), 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="study-trail-admin-${stamp}.md"`,
    });
  }

  const inTasks = taskIds.map(() => "?").join(", ");
  const rosterFilter = [classId ? "AND u.class_id = ?" : "", userId ? "AND u.id = ?" : ""].filter(Boolean).join(" ");
  const rosterBinds = [...taskIds, ...(classId ? [classId] : []), ...(userId ? [userId] : [])];

  const [stepsRes, rosterRes, progressRes, filesRes, logsRes, logFilesRes, repliesRes] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT task_id, title FROM task_steps WHERE task_id IN (${inTasks}) ORDER BY task_id, position, id`).bind(...taskIds),
    c.env.DB.prepare(
      `SELECT t.id AS task_id, u.id AS user_id, u.name, u.username, cl.name AS class_name
         FROM tasks t JOIN users u ON ${ELIGIBLE}
         LEFT JOIN classes cl ON cl.id = u.class_id
        WHERE t.id IN (${inTasks}) ${rosterFilter}
        ORDER BY t.id, u.id`,
    ).bind(...rosterBinds),
    c.env.DB.prepare(`SELECT * FROM progress WHERE task_id IN (${inTasks})`).bind(...taskIds),
    c.env.DB.prepare(
      `SELECT id, task_id, owner_user_id, name, mime, size FROM files
        WHERE scope = 'progress' AND task_id IN (${inTasks}) ORDER BY created_at, id`,
    ).bind(...taskIds),
    c.env.DB.prepare(
      `SELECT id, task_id, user_id, minutes, content, log_date FROM study_logs
        WHERE task_id IN (${inTasks}) ORDER BY log_date DESC, id DESC`,
    ).bind(...taskIds),
    c.env.DB.prepare(
      `SELECT f.id, f.log_id, f.name, f.mime, f.size
         FROM files f JOIN study_logs l ON l.id = f.log_id
        WHERE l.task_id IN (${inTasks}) ORDER BY f.created_at, f.id`,
    ).bind(...taskIds),
    c.env.DB.prepare(
      `SELECT r.id, r.log_id, r.content, r.created_at, u.name AS author_name
         FROM log_replies r JOIN users u ON u.id = r.user_id JOIN study_logs l ON l.id = r.log_id
        WHERE l.task_id IN (${inTasks}) ORDER BY r.id`,
    ).bind(...taskIds),
  ]);

  const stepMap = groupBy(stepsRes.results as Record<string, unknown>[], "task_id");
  const rosterMap = groupBy(rosterRes.results as Record<string, unknown>[], "task_id");
  const progressMap = new Map((progressRes.results as any[]).map((row) => [`${row.task_id}:${row.user_id}`, row]));
  const fileMap = groupBy(filesRes.results as Record<string, unknown>[], "task_id");
  const logMap = groupBy(logsRes.results as Record<string, unknown>[], "task_id");
  const logFileMap = groupBy(logFilesRes.results as Record<string, unknown>[], "log_id");
  const replyMap = groupBy(repliesRes.results as Record<string, unknown>[], "log_id");

  const exportTasks = tasks.map((task) => {
    const roster = (rosterMap.get(task.id) ?? []) as any[];
    return {
      ...task,
      steps: (stepMap.get(task.id) ?? []) as any[],
      rows: roster.map((student) => {
        const progress = progressMap.get(`${task.id}:${student.user_id}`) as any;
        const logs = ((logMap.get(task.id) ?? []) as any[])
          .filter((log) => log.user_id === student.user_id)
          .map((log) => ({
            ...log,
            files: (logFileMap.get(log.id) ?? []) as any,
            replies: (replyMap.get(log.id) ?? []) as any,
          }));
        return {
          name: student.name,
          username: student.username,
          class_name: student.class_name,
          status: progress?.status ?? null,
          percent: progress?.percent ?? 0,
          note: progress?.note ?? null,
          link: progress?.link ?? null,
          review_comment: progress?.review_comment ?? null,
          score: progress?.score ?? null,
          submitted_at: progress?.submitted_at ?? null,
          reviewed_at: progress?.reviewed_at ?? null,
          files: ((fileMap.get(task.id) ?? []) as any[]).filter((file) => file.owner_user_id === student.user_id),
          logs,
        };
      }),
    };
  });

  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return c.body(buildAdminMarkdown(me.name, exportTasks, scopeLabel), 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="study-trail-admin-${stamp}.md"`,
  });
});

/* ---------------- 进度矩阵 ---------------- */

adminRoutes.get("/matrix", async (c) => {
  const classId = int(c.req.query("class_id"), "班级", { optional: true });
  const db = c.env.DB;
  const classFilter = classId ? "AND u.class_id = ?" : "";
  const taskFilter = classId
    ? "AND (NOT EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = t.id) OR EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = t.id AND tc.class_id = ?))"
    : "";
  const bind = (s: D1PreparedStatement) => (classId ? s.bind(classId) : s);
  const [students, tasks, cells] = await db.batch([
    bind(db.prepare(`SELECT u.id, u.name, u.class_id FROM users u WHERE u.role = 'student' AND u.active = 1 ${classFilter} ORDER BY u.class_id, u.id`)),
    bind(
      db.prepare(
        `SELECT t.id, t.title, t.class_id, t.due_date,
                (SELECT GROUP_CONCAT(class_id) FROM task_classes WHERE task_id = t.id) AS class_ids,
                (SELECT GROUP_CONCAT(user_id) FROM task_exclusions WHERE task_id = t.id) AS excluded_user_ids
           FROM tasks t WHERE t.status = 'published' ${taskFilter} ORDER BY t.id`,
      ),
    ),
    bind(
      db.prepare(
        `SELECT p.task_id, p.user_id, p.status, p.percent FROM progress p
           JOIN users u ON u.id = p.user_id JOIN tasks t ON t.id = p.task_id
          WHERE t.status = 'published' AND u.active = 1 ${classFilter}`,
      ),
    ),
  ]);
  return c.json({
    students: students.results,
    tasks: (tasks.results as any[]).map((task) => ({
      ...task,
      class_ids: task.class_ids ? String(task.class_ids).split(",").map(Number) : [],
      excluded_user_ids: task.excluded_user_ids ? String(task.excluded_user_ids).split(",").map(Number) : [],
    })),
    cells: cells.results,
  });
});
