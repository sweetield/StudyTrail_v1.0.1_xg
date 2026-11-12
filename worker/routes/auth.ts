import { Hono } from "hono";
import type { AppEnv } from "../types";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { createSession, destroySession, readSession, requireAuth } from "../lib/session";
import { HttpError, password, str, username } from "../lib/validate";
import { audit } from "../lib/audit";

const MAX_FAILED = 5;
const LOCK_SECONDS = 10 * 60;
const DUMMY_HASH = "pbkdf2$20000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/setup", async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first<{ n: number }>();
  return c.json({ needsSetup: (row?.n ?? 0) === 0 });
});

authRoutes.post("/setup", async (c) => {
  const body = await c.req.json();
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first<{ n: number }>();
  if ((row?.n ?? 0) > 0) throw new HttpError(409, "系统已初始化");
  const u = username(body.username);
  const name = str(body.name, "姓名", { max: 32 });
  const hash = await hashPassword(password(body.password));
  // 条件插入保证并发初始化时只会创建一个管理员
  const result = await c.env.DB.prepare(
    `INSERT INTO users (username, name, password_hash, role)
     SELECT ?, ?, ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') RETURNING id`,
  )
    .bind(u, name, hash)
    .first<{ id: number }>();
  if (!result) throw new HttpError(409, "系统已初始化");
  await createSession(c, result.id);
  return c.json({ ok: true });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const u = str(body.username, "用户名", { max: 32 });
  const pw = typeof body.password === "string" ? body.password : "";
  const user = await c.env.DB.prepare(
    "SELECT id, name, role, password_hash, active, failed_attempts, locked_until FROM users WHERE username = ?",
  )
    .bind(u)
    .first<{ id: number; name: string; role: string; password_hash: string; active: number; failed_attempts: number; locked_until: number }>();

  const now = Math.floor(Date.now() / 1000);
  if (!user) {
    // 对不存在的用户同样执行一次哈希校验，避免通过响应耗时枚举用户名
    await verifyPassword(pw, DUMMY_HASH);
    throw new HttpError(401, "用户名或密码错误");
  }
  if (!user.active) throw new HttpError(403, "账号已停用，请联系管理员");
  if (user.locked_until > now) {
    const mins = Math.ceil((user.locked_until - now) / 60);
    throw new HttpError(429, `登录失败次数过多，请 ${mins} 分钟后再试`);
  }

  if (!(await verifyPassword(pw, user.password_hash))) {
    const failed = user.failed_attempts + 1;
    const lockedUntil = failed >= MAX_FAILED ? now + LOCK_SECONDS : 0;
    await c.env.DB.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?")
      .bind(lockedUntil ? 0 : failed, lockedUntil, user.id)
      .run();
    throw new HttpError(401, "用户名或密码错误");
  }

  await createSession(c, user.id);
  if (user.role === "admin") await audit(c, "登录系统", "", user).run();
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ user: null });
  const { user } = session;
  return c.json({ user: { ...user, must_change_password: !!user.must_change_password } });
});

authRoutes.post("/password", requireAuth, async (c) => {
  const body = await c.req.json();
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(String(body.oldPassword ?? ""), row.password_hash))) {
    throw new HttpError(400, "原密码不正确");
  }
  const next = password(body.newPassword);
  if (next === body.oldPassword) throw new HttpError(400, "新密码不能与原密码相同");
  const hash = await hashPassword(next);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").bind(hash, user.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(user.id, c.get("sessionId")),
  ]);
  return c.json({ ok: true });
});
