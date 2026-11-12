import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../lib/session";
import { HttpError, int } from "../lib/validate";
import {
  MAX_FILE_BYTES,
  MAX_PROGRESS_FILES,
  decryptFile,
  deleteStoredObjects,
  encryptFile,
  fileMeta,
  getStoredObject,
  putStoredObject,
  type FileRow,
} from "../lib/storage";

export const fileRoutes = new Hono<AppEnv>();
fileRoutes.use("*", requireAuth);

const SAFE_INLINE_IMAGE = /^image\/(jpeg|png|gif|webp|bmp|avif)$/i;
const SAFE_IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const PROGRESS_ARCHIVE_EXT = /\.(7z|tar)$/i;
/** 脚本 / 可执行文件一律不允许上传，避免被当作作品或附件传播 */
const BLOCKED_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|html?|svg|php|phtml|exe|dll|bat|cmd|ps1|sh|jar|msi|vbs|scr)$/i;

function isFile(value: unknown): value is File {
  return !!value && typeof value === "object" && typeof (value as File).arrayBuffer === "function" && typeof (value as File).name === "string";
}

function mimeFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const images: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    avif: "image/avif",
  };
  if (images[ext]) return images[ext];
  if (ext === "7z") return "application/x-7z-compressed";
  if (ext === "tar") return "application/x-tar";
  return null;
}

/** 所有附件仅允许图片与 .7z / .tar 压缩包，拒绝 PDF、Office 文档、脚本、Markdown 等格式 */
function assertAttachmentFile(name: string, mime: string) {
  if (PROGRESS_ARCHIVE_EXT.test(name)) return;
  if (SAFE_IMAGE_EXT.test(name) && (!mime || SAFE_INLINE_IMAGE.test(mime))) return;
  throw new HttpError(400, "附件仅支持图片（JPG、PNG、GIF、WebP、BMP、AVIF）和 .7z / .tar 压缩包，不支持 PDF、Office 文档、脚本等格式");
}

function cleanName(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "附件";
  return (
    base
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 180) || "附件"
  );
}

function displayName(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").slice(0, 120) || "file";
  return `filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** 学员上传附件：先加密写入文件存储（R2 或 KV），再记录元数据 */
fileRoutes.post("/", async (c) => {
  const user = c.get("user");
  if (user.role !== "student") throw new HttpError(403, "仅学员可上传附件");

  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    throw new HttpError(400, "上传数据格式不正确");
  }

  const file = form.get("file");
  if (!isFile(file)) throw new HttpError(400, "请选择要上传的文件");
  if (!file.size) throw new HttpError(400, "不能上传空文件");
  if (file.size > MAX_FILE_BYTES) throw new HttpError(400, `单个文件不能超过 ${MAX_FILE_BYTES / 1024 / 1024} MB`);

  const scope = form.get("scope") === "progress" ? "progress" : "log";
  let taskId: number | null = null;

  if (scope === "progress") {
    taskId = int(form.get("task_id"), "任务ID")!;
    const task = await c.env.DB.prepare(
      `SELECT t.id, p.status
         FROM tasks t
         LEFT JOIN progress p ON p.task_id = t.id AND p.user_id = ?1
        WHERE t.id = ?2 AND t.status = 'published'
          AND (
            NOT EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = t.id)
            OR EXISTS (SELECT 1 FROM task_classes tc WHERE tc.task_id = t.id AND tc.class_id = ?3)
          )
          AND NOT EXISTS (SELECT 1 FROM task_exclusions te WHERE te.task_id = t.id AND te.user_id = ?1)`,
    )
      .bind(user.id, taskId, user.class_id)
      .first<{ id: number; status: string | null }>();
    if (!task) throw new HttpError(404, "任务不存在或未发布");
    if (task.status === "submitted" || task.status === "approved") {
      throw new HttpError(409, "已提交审核，如需修改请先撤回");
    }
    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM files WHERE scope = 'progress' AND task_id = ? AND owner_user_id = ?",
    )
      .bind(taskId, user.id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_PROGRESS_FILES) {
      throw new HttpError(400, `每个任务最多上传 ${MAX_PROGRESS_FILES} 个作品附件`);
    }
  }

  const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  const r2Key = `files/${id}`;
  const name = cleanName(file.name);
  if (BLOCKED_EXT.test(name)) throw new HttpError(400, "不支持上传脚本或可执行文件");
  const suppliedMime = file.type || "";
  let mime = (suppliedMime || mimeFromName(name) || "application/octet-stream").slice(0, 120);
  assertAttachmentFile(name, suppliedMime);
  if (PROGRESS_ARCHIVE_EXT.test(name)) mime = mimeFromName(name) ?? mime;
  const { iv, data } = await encryptFile(c.env, id, await file.arrayBuffer());

  await putStoredObject(c.env, r2Key, data);

  let row: FileRow;
  try {
    row = (await c.env.DB.prepare(
      `INSERT INTO files (id, uploader_id, owner_user_id, scope, log_id, task_id, name, mime, size, iv, r2_key)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
      .bind(id, user.id, user.id, scope, taskId, name, mime, file.size, iv, r2Key)
      .first()) as FileRow;
  } catch (err) {
    await deleteStoredObjects(c.env, [r2Key]);
    throw err;
  }

  return c.json({ file: fileMeta(row) });
});

/** 下载 / 预览附件：管理员或附件所属学员可访问，读取时解密 */
fileRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpError(404, "文件不存在");

  const file = await c.env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<FileRow>();
  if (!file) throw new HttpError(404, "文件不存在");
  if (user.role !== "admin" && file.owner_user_id !== user.id && file.uploader_id !== user.id) {
    throw new HttpError(403, "无权访问该文件");
  }

  const object = await getStoredObject(c.env, file.r2_key);
  if (!object) throw new HttpError(404, "文件内容不存在，可能已被清理");

  let data: ArrayBuffer;
  try {
    data = await decryptFile(c.env, file, object);
  } catch (err) {
    console.error("decrypt file failed", file.id, err);
    throw new HttpError(500, "文件解密失败，可能是加密密钥已变更");
  }

  const inline = SAFE_INLINE_IMAGE.test(file.mime);
  return c.body(data, 200, {
    "Content-Type": file.mime,
    "Content-Length": String(data.byteLength),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; ${displayName(file.name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  });
});

/** 删除附件（学员删除自己的，管理员可删除任意） */
fileRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpError(404, "文件不存在");

  const file = await c.env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<FileRow>();
  if (!file) throw new HttpError(404, "文件不存在");
  if (user.role !== "admin") {
    if (file.owner_user_id !== user.id && file.uploader_id !== user.id) throw new HttpError(403, "无权删除该文件");
    if (file.scope === "progress" && file.task_id) {
      const progress = await c.env.DB.prepare("SELECT status FROM progress WHERE task_id = ? AND user_id = ?")
        .bind(file.task_id, file.owner_user_id)
        .first<{ status: string }>();
      if (progress?.status === "submitted" || progress?.status === "approved") {
        throw new HttpError(409, "已提交审核，如需修改请先撤回");
      }
    }
  }

  await c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
  await deleteStoredObjects(c.env, [file.r2_key]);
  return c.json({ ok: true });
});
