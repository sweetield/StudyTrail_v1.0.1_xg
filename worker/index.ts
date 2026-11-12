import { Hono } from "hono";
import type { AppEnv, Env } from "./types";
import { HttpError } from "./lib/validate";
import { ensureSchema } from "./lib/migrate";
import { authRoutes } from "./routes/auth";
import { studentRoutes } from "./routes/student";
import { adminRoutes } from "./routes/admin";
import { dataRoutes } from "./routes/data";
import { teamRoutes } from "./routes/team";
import { notificationRoutes } from "./routes/notifications";
import { announcementRoutes } from "./routes/announcement";
import { fileRoutes } from "./routes/files";
import { avatarRoutes } from "./routes/avatars";
import { deleteStoredObjects } from "./lib/storage";

const MAX_BODY_BYTES = 25 * 1024 * 1024;

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  // CSRF 防护：跨站表单无法携带自定义请求头，且未开放 CORS
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (c.req.header("x-requested-with") !== "fetch") return c.json({ error: "非法请求" }, 403);
    if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) return c.json({ error: "请求数据过大" }, 413);
  }
  await ensureSchema(c.env.DB);
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
});

app.get("/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ ok: true, time: new Date().toISOString() });
});

app.route("/auth", authRoutes);
app.route("/me", studentRoutes);
app.route("/notifications", notificationRoutes);
app.route("/announcement", announcementRoutes);
app.route("/files", fileRoutes);
app.route("/avatars", avatarRoutes);
app.route("/admin/data", dataRoutes);
app.route("/admin/team", teamRoutes);
app.route("/admin", adminRoutes);

app.notFound((c) => c.json({ error: "接口不存在" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (err instanceof SyntaxError) return c.json({ error: "请求数据格式错误" }, 400);
  console.error(err);
  return c.json({ error: "服务器错误，请稍后再试" }, 500);
});

async function cleanup(env: Env) {
  await ensureSchema(env.DB);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?").bind(now - 90 * 86400),
    env.DB.prepare("DELETE FROM notifications WHERE created_at < ?").bind(now - 365 * 86400),
    env.DB.prepare("DELETE FROM task_urges WHERE due_at < ?").bind(now - 30 * 86400),
    env.DB.prepare("DELETE FROM audit_logs WHERE created_at < ?").bind(now - 2 * 365 * 86400),
  ]);

  // 清理上传后未绑定到日志的草稿附件（文件内容与元数据一并删除）
  const stale = await env.DB.prepare(
    "DELETE FROM files WHERE scope = 'log' AND log_id IS NULL AND created_at < ? RETURNING r2_key",
  )
    .bind(now - 86400)
    .all<{ r2_key: string }>();
  await deleteStoredObjects(env, stale.results.map((row) => row.r2_key));
}

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;
