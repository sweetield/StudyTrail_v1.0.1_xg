import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAdmin, requireAuth } from "../lib/session";
import { hashPassword } from "../lib/crypto";
import { audit } from "../lib/audit";
import { HttpError, int, password, str, username } from "../lib/validate";

export const teamRoutes = new Hono<AppEnv>();
teamRoutes.use("*", requireAuth, requireAdmin);

const AUDIT_PAGE = 50;

teamRoutes.get("/members", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, username, name, active, must_change_password, last_login_at, created_at,
            (SELECT a.id FROM avatars a WHERE a.user_id = users.id) AS avatar_id
       FROM users WHERE role = 'admin' ORDER BY active DESC, id`,
  ).all();
  return c.json({ members: results });
});

teamRoutes.post("/members", async (c) => {
  const body = await c.req.json();
  const u = username(body.username);
  const name = str(body.name, "姓名", { max: 32 });
  const hash = await hashPassword(password(body.password));
  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(u).first();
  if (exists) throw new HttpError(409, "用户名已存在");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users (username, name, password_hash, role, must_change_password) VALUES (?, ?, ?, 'admin', 1)",
    ).bind(u, name, hash),
    audit(c, "新增辅导员", `${name}（${u}）`),
  ]);
  return c.json({ ok: true });
});

teamRoutes.patch("/members/:id", async (c) => {
  const id = int(c.req.param("id"), "账号ID")!;
  const me = c.get("user");
  const body = await c.req.json();
  const db = c.env.DB;
  const member = await db.prepare("SELECT id, name, username FROM users WHERE id = ? AND role = 'admin'").bind(id).first<{ name: string; username: string }>();
  if (!member) throw new HttpError(404, "账号不存在");
  const label = `${member.name}（${member.username}）`;
  const stmts: D1PreparedStatement[] = [];

  if (body.name !== undefined) {
    stmts.push(db.prepare("UPDATE users SET name = ? WHERE id = ?").bind(str(body.name, "姓名", { max: 32 }), id));
  }
  if (body.active !== undefined) {
    if (id === me.id) throw new HttpError(400, "不能停用自己的账号");
    if (!body.active) {
      const others = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?").bind(id).first<{ n: number }>();
      if ((others?.n ?? 0) === 0) throw new HttpError(400, "至少需要保留一个可用的辅导员账号");
    }
    stmts.push(db.prepare("UPDATE users SET active = ? WHERE id = ?").bind(body.active ? 1 : 0, id));
    if (!body.active) stmts.push(db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
    stmts.push(audit(c, body.active ? "启用辅导员" : "停用辅导员", label));
  }
  if (body.password !== undefined) {
    if (id === me.id) throw new HttpError(400, "请在「修改密码」页面修改自己的密码");
    const hash = await hashPassword(password(body.password));
    stmts.push(
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = 0 WHERE id = ?").bind(hash, id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
      audit(c, "重置辅导员密码", label),
    );
  }
  if (stmts.length) await db.batch(stmts);
  return c.json({ ok: true });
});

teamRoutes.get("/audit", async (c) => {
  const before = int(c.req.query("before"), "游标", { optional: true, min: 1 });
  const stmt = before
    ? c.env.DB.prepare(
        "SELECT id, actor_name, action, target, ip, created_at FROM audit_logs WHERE id < ? ORDER BY id DESC LIMIT ?",
      ).bind(before, AUDIT_PAGE)
    : c.env.DB.prepare("SELECT id, actor_name, action, target, ip, created_at FROM audit_logs ORDER BY id DESC LIMIT ?").bind(AUDIT_PAGE);
  const { results } = await stmt.all<{ id: number }>();
  return c.json({ items: results, nextCursor: results.length === AUDIT_PAGE ? results[results.length - 1].id : null });
});
