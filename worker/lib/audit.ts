import type { Context } from "hono";
import type { AppEnv } from "../types";

export function audit(
  c: Context<AppEnv>,
  action: string,
  target = "",
  actor: { id: number | null; name: string } | undefined = c.get("user"),
) {
  const ip = c.req.header("cf-connecting-ip") ?? "";
  return c.env.DB.prepare("INSERT INTO audit_logs (actor_id, actor_name, action, target, ip) VALUES (?, ?, ?, ?, ?)").bind(
    actor?.id ?? null,
    actor?.name ?? "系统",
    action,
    target.slice(0, 200),
    ip,
  );
}
