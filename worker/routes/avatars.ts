import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../lib/session";
import { HttpError } from "../lib/validate";
import {
  MAX_AVATAR_BYTES,
  decryptFile,
  deleteStoredObjects,
  encryptFile,
  getStoredObject,
  putStoredObject,
  type AvatarRow,
} from "../lib/storage";

export const avatarRoutes = new Hono<AppEnv>();
avatarRoutes.use("*", requireAuth);

const ALLOWED_IMAGE = /^image\/(jpeg|png|gif|webp|bmp|avif)$/i;

function isFile(value: unknown): value is File {
  return !!value && typeof value === "object" && typeof (value as File).arrayBuffer === "function" && typeof (value as File).name === "string";
}

function cleanName(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "头像";
  return (
    base
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 120) || "头像"
  );
}

/** 上传 / 替换当前用户头像 */
avatarRoutes.post("/", async (c) => {
  const user = c.get("user");
  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    throw new HttpError(400, "上传数据格式不正确");
  }

  const file = form.get("file");
  if (!isFile(file)) throw new HttpError(400, "请选择头像图片");
  if (!file.size) throw new HttpError(400, "不能上传空文件");
  if (file.size > MAX_AVATAR_BYTES) throw new HttpError(400, `头像不能超过 ${MAX_AVATAR_BYTES / 1024 / 1024} MB`);
  if (!ALLOWED_IMAGE.test(file.type || "")) throw new HttpError(400, "头像仅支持 JPG、PNG、GIF、WebP、BMP 或 AVIF 图片");

  const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  const storageKey = `avatars/${id}`;
  const { iv, data } = await encryptFile(c.env, id, await file.arrayBuffer());
  await putStoredObject(c.env, storageKey, data);

  const old = await c.env.DB.prepare("SELECT storage_key FROM avatars WHERE user_id = ?").bind(user.id).first<{ storage_key: string }>();
  try {
    await c.env.DB.prepare(
      `INSERT INTO avatars (user_id, id, name, mime, size, iv, storage_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         id = excluded.id, name = excluded.name, mime = excluded.mime, size = excluded.size,
         iv = excluded.iv, storage_key = excluded.storage_key, created_at = unixepoch()`,
    )
      .bind(user.id, id, cleanName(file.name), file.type, file.size, iv, storageKey)
      .run();
  } catch (err) {
    await deleteStoredObjects(c.env, [storageKey]);
    throw err;
  }
  if (old?.storage_key) await deleteStoredObjects(c.env, [old.storage_key]);

  return c.json({ avatar_id: id });
});

/** 删除当前用户头像 */
avatarRoutes.delete("/", async (c) => {
  const user = c.get("user");
  const old = await c.env.DB.prepare("SELECT storage_key FROM avatars WHERE user_id = ?").bind(user.id).first<{ storage_key: string }>();
  if (!old) return c.json({ ok: true });
  await c.env.DB.prepare("DELETE FROM avatars WHERE user_id = ?").bind(user.id).run();
  await deleteStoredObjects(c.env, [old.storage_key]);
  return c.json({ ok: true });
});

/** 读取头像：所有已登录用户都可以查看，内容读取时解密 */
avatarRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpError(404, "头像不存在");

  const avatar = await c.env.DB.prepare("SELECT * FROM avatars WHERE id = ?").bind(id).first<AvatarRow>();
  if (!avatar) throw new HttpError(404, "头像不存在");

  const stored = await getStoredObject(c.env, avatar.storage_key);
  if (!stored) throw new HttpError(404, "头像内容不存在");

  let data: ArrayBuffer;
  try {
    data = await decryptFile(c.env, avatar, stored);
  } catch (err) {
    console.error("decrypt avatar failed", avatar.id, err);
    throw new HttpError(500, "头像解密失败，可能是加密密钥已变更");
  }

  return c.body(data, 200, {
    "Content-Type": avatar.mime,
    "Content-Length": String(data.byteLength),
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  });
});
