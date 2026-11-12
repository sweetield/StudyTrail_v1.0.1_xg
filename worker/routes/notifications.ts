import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../lib/session";
import { int } from "../lib/validate";

export const notificationRoutes = new Hono<AppEnv>();
notificationRoutes.use("*", requireAuth);

notificationRoutes.get("/", async (c) => {
  const user = c.get("user");
  const [items, unread] = await c.env.DB.batch([
    c.env.DB.prepare(
      "SELECT id, kind, title, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30",
    ).bind(user.id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(user.id),
  ]);
  return c.json({ items: items.results, unread: (unread.results[0] as { n: number }).n });
});

notificationRoutes.post("/read", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ id?: unknown }>();
  const id = int(body.id, "通知ID", { optional: true });
  const stmt = id
    ? c.env.DB.prepare("UPDATE notifications SET read_at = unixepoch() WHERE id = ? AND user_id = ? AND read_at IS NULL").bind(id, user.id)
    : c.env.DB.prepare("UPDATE notifications SET read_at = unixepoch() WHERE user_id = ? AND read_at IS NULL").bind(user.id);
  await stmt.run();
  return c.json({ ok: true });
});
