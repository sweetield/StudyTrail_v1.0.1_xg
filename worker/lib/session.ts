import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, SessionUser } from "../types";
import { randomToken, sha256 } from "./crypto";

const COOKIE = "st_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const RENEW_THRESHOLD = MAX_AGE / 2;

function cookieOpts(c: Context<AppEnv>) {
  // 开发预览运行在跨站 iframe 中，需要 SameSite=None；生产环境使用更严格的 Lax
  const sameSite = import.meta.env.DEV ? "None" : "Lax";
  return { httpOnly: true, secure: true, sameSite, path: "/" } as const;
}

export async function createSession(c: Context<AppEnv>, userId: number) {
  const token = randomToken();
  const id = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(userId, now),
    c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(id, userId, now + MAX_AGE),
    c.env.DB.prepare("UPDATE users SET last_login_at = ?, failed_attempts = 0, locked_until = 0 WHERE id = ?").bind(now, userId),
  ]);
  setCookie(c, COOKIE, token, { ...cookieOpts(c), maxAge: MAX_AGE });
}

export async function destroySession(c: Context<AppEnv>) {
  const token = getCookie(c, COOKIE);
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  }
  deleteCookie(c, COOKIE, cookieOpts(c));
}

export async function readSession(c: Context<AppEnv>): Promise<{ user: SessionUser; sessionId: string } | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const sessionId = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.name, u.role, u.class_id, cl.name AS class_name,
            (SELECT a.id FROM avatars a WHERE a.user_id = u.id) AS avatar_id,
            u.must_change_password, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       LEFT JOIN classes cl ON cl.id = u.class_id
      WHERE s.id = ? AND s.expires_at > unixepoch() AND u.active = 1`,
  )
    .bind(sessionId)
    .first<SessionUser & { expires_at: number }>();
  if (!row) return null;
  const { expires_at, ...user } = row;

  // 滑动续期：活跃用户在剩余有效期不足一半时自动延长，避免频繁重新登录
  const now = Math.floor(Date.now() / 1000);
  if (expires_at - now < RENEW_THRESHOLD) {
    await c.env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(now + MAX_AGE, sessionId).run();
    setCookie(c, COOKIE, token, { ...cookieOpts(c), maxAge: MAX_AGE });
  }
  return { user, sessionId };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: "请先登录" }, 401);
  c.set("user", session.user);
  c.set("sessionId", session.sessionId);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user")?.role !== "admin") return c.json({ error: "无权限访问" }, 403);
  await next();
};

export const requireStudent: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user")?.role !== "student") return c.json({ error: "仅学员可访问" }, 403);
  await next();
};
