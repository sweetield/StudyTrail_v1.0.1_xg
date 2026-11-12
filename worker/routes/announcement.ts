import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../lib/session";

export const announcementRoutes = new Hono<AppEnv>();
announcementRoutes.use("*", requireAuth);

/** 当前通告。show 为 true 时前端弹窗提示；点击“我知道了”后本次登录不再提示。 */
announcementRoutes.get("/", async (c) => {
  const user = c.get("user");
  const [announcement, state] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT value, updated_at FROM app_settings WHERE key = 'announcement'"),
    c.env.DB.prepare(
      "SELECT last_login_at, announcement_seen_at, announcement_seen_login_at FROM users WHERE id = ?",
    ).bind(user.id),
  ]);
  const row = announcement.results[0] as { value: string; updated_at: number } | undefined;
  const content = row?.value?.trim() ? row.value : "";
  if (!content) return c.json({ announcement: null, show: false });

  const current = state.results[0] as
    | { last_login_at: number | null; announcement_seen_at: number; announcement_seen_login_at: number }
    | undefined;
  const updatedAt = row?.updated_at ?? 0;
  const lastLogin = current?.last_login_at ?? 0;
  const show =
    updatedAt > (current?.announcement_seen_at ?? 0) ||
    lastLogin > (current?.announcement_seen_login_at ?? 0);

  return c.json({ announcement: { content, updated_at: updatedAt }, show });
});

/** 确认已阅读：记录到本次登录，下次登录会重新提示 */
announcementRoutes.post("/ack", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare(
    `UPDATE users SET
       announcement_seen_at = COALESCE((SELECT updated_at FROM app_settings WHERE key = 'announcement'), 0),
       announcement_seen_login_at = COALESCE(last_login_at, 0)
     WHERE id = ?`,
  )
    .bind(user.id)
    .run();
  return c.json({ ok: true });
});
