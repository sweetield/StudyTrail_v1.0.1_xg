import type { Env } from "../types";
import { HttpError } from "./validate";

/**
 * 任务发布范围 SQL：
 * - task_classes 为空 => 面向全部学员
 * - task_classes 有记录 => 仅面向这些班级
 * - task_exclusions 中的学员始终排除
 *
 * 参数 taskAlias / userAlias 是 SQL 中 tasks / users 的别名。
 */
export function audienceSql(taskAlias = "t", userAlias = "u"): string {
  return `(
    NOT EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = ${taskAlias}.id)
    OR EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = ${taskAlias}.id AND tc.class_id = ${userAlias}.class_id)
  ) AND NOT EXISTS (
    SELECT 1 FROM task_exclusions te WHERE te.task_id = ${taskAlias}.id AND te.user_id = ${userAlias}.id
  )`;
}

/** 当前登录学员可见的任务条件（?1 = user.id，?2 = user.class_id） */
export const STUDENT_VISIBLE = `t.status = 'published' AND (
  NOT EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = t.id)
  OR EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = t.id AND tc.class_id = ?2)
) AND NOT EXISTS (
  SELECT 1 FROM task_exclusions te WHERE te.task_id = t.id AND te.user_id = ?1
)`;

export function normalizeIdList(value: unknown, field: string, max = 1000): number[] {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new HttpError(400, `${field}格式不正确`);
  const raw = value.map((item) => Number(item));
  if (raw.some((n) => !Number.isInteger(n) || n <= 0)) throw new HttpError(400, `${field}格式不正确`);
  const ids = [...new Set(raw)];
  if (ids.length > max) throw new HttpError(400, `${field}最多选择 ${max} 项`);
  return ids;
}

export async function loadTaskAudience(env: Env, taskId: number): Promise<{ classIds: number[]; excludedUserIds: number[] }> {
  const [classes, excluded] = await env.DB.batch([
    env.DB.prepare("SELECT class_id FROM task_classes WHERE task_id = ? ORDER BY class_id").bind(taskId),
    env.DB.prepare("SELECT user_id FROM task_exclusions WHERE task_id = ? ORDER BY user_id").bind(taskId),
  ]);
  return {
    classIds: (classes.results as { class_id: number }[]).map((row) => row.class_id),
    excludedUserIds: (excluded.results as { user_id: number }[]).map((row) => row.user_id),
  };
}

/** 生成替换发布范围的 SQL 语句，供 D1 batch 与任务写入放在同一事务中 */
export function audienceStatements(db: D1Database, taskId: number, classIds: number[], excludedUserIds: number[]): D1PreparedStatement[] {
  return [
    db.prepare("DELETE FROM task_classes WHERE task_id = ?").bind(taskId),
    db.prepare("DELETE FROM task_exclusions WHERE task_id = ?").bind(taskId),
    ...classIds.map((classId) => db.prepare("INSERT INTO task_classes (task_id, class_id) VALUES (?, ?)").bind(taskId, classId)),
    ...excludedUserIds.map((userId) => db.prepare("INSERT INTO task_exclusions (task_id, user_id) VALUES (?, ?)").bind(taskId, userId)),
  ];
}

export async function taskAudienceUserIds(env: Env, taskId: number): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `SELECT u.id FROM users u JOIN tasks t ON t.id = ?
      WHERE u.role = 'student' AND u.active = 1 AND ${audienceSql("t", "u")}`,
  )
    .bind(taskId)
    .all<{ id: number }>();
  return results.map((row) => row.id);
}

/** 分批写入通知，避免单次 batch 语句过多 */
export async function notifyTaskUsers(env: Env, userIds: number[], title: string, taskId: number): Promise<void> {
  if (!userIds.length) return;
  const link = `/app/tasks/${taskId}`;
  for (let i = 0; i < userIds.length; i += 50) {
    const chunk = userIds.slice(i, i + 50);
    await env.DB.batch(
      chunk.map((userId) => env.DB.prepare("INSERT INTO notifications (user_id, kind, title, link) VALUES (?, 'task', ?, ?)").bind(userId, title, link)),
    );
  }
}
