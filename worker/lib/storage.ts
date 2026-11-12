import type { Env } from "../types";
import { HttpError } from "./validate";

const encoder = new TextEncoder();

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MAX_LOG_FILES = 5;
export const MAX_PROGRESS_FILES = 5;

/** Cloudflare KV 单个 value 上限为 25 MiB，加密后仍需留出少量空间 */
const MAX_KV_BYTES = 25 * 1024 * 1024;

export interface FileRow {
  id: string;
  uploader_id: number;
  owner_user_id: number;
  scope: "log" | "progress";
  log_id: number | null;
  task_id: number | null;
  name: string;
  mime: string;
  size: number;
  iv: string;
  r2_key: string;
  created_at: number;
}

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  created_at: number;
}

export interface AvatarRow {
  user_id: number;
  id: string;
  name: string;
  mime: string;
  size: number;
  iv: string;
  storage_key: string;
  created_at: number;
}

export function fileMeta(row: Pick<FileRow, "id" | "name" | "mime" | "size" | "created_at">): FileMeta {
  return { id: row.id, name: row.name, mime: row.mime, size: row.size, created_at: row.created_at };
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** 接受 Base64、64 位十六进制或 32 字符原始密钥，统一转成 32 字节 */
function parseSecret(value: string): Uint8Array<ArrayBuffer> {
  const text = value.trim();
  if (/^[a-f0-9]{64}$/i.test(text)) return fromHex(text);
  try {
    const decoded = fromBase64(text);
    if (decoded.length === 32) return decoded;
  } catch {
    // 不是 Base64，继续尝试原始字符串
  }
  const raw = encoder.encode(text);
  if (raw.length === 32) return raw;
  throw new Error("FILE_ENCRYPTION_KEY 必须是 32 字节（Base64、64 位十六进制或 32 字符）");
}

async function importKey(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

let keyPromise: Promise<CryptoKey> | null = null;

async function loadKey(env: Env): Promise<CryptoKey> {
  const configured = env.FILE_ENCRYPTION_KEY?.trim();
  if (configured) return importKey(parseSecret(configured));

  const select = env.DB.prepare("SELECT value FROM app_settings WHERE key = 'file_encryption_key'");
  let row = await select.first<{ value: string }>();
  if (!row) {
    // 一键部署时无需手动配置：首次使用自动生成统一密钥并保存在 D1。
    // 多个实例同时冷启动时使用 INSERT OR IGNORE，再读取实际写入的值。
    const generated = toBase64(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('file_encryption_key', ?)")
      .bind(generated)
      .run();
    row = await select.first<{ value: string }>();
  }
  if (!row) throw new Error("无法初始化文件加密密钥");
  return importKey(parseSecret(row.value));
}

export function getEncryptionKey(env: Env): Promise<CryptoKey> {
  keyPromise ??= loadKey(env).catch((err) => {
    keyPromise = null;
    throw err;
  });
  return keyPromise;
}

export async function encryptFile(
  env: Env,
  fileId: string,
  data: ArrayBuffer,
): Promise<{ iv: string; data: ArrayBuffer }> {
  const key = await getEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // 用文件 ID 作为附加认证数据，避免密文被调换到其他文件记录上
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(fileId) },
    key,
    data,
  );
  return { iv: toHex(iv), data: encrypted };
}

export async function decryptFile(env: Env, file: Pick<FileRow, "id" | "iv"> | Pick<AvatarRow, "id" | "iv">, data: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await getEncryptionKey(env);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(file.iv), additionalData: encoder.encode(file.id) },
    key,
    data,
  );
}

/**
 * 文件内容存储后端：默认 R2，也可以在 wrangler.jsonc 中只绑定 KV（FILE_KV），
 * 或同时绑定两者并通过 FILE_STORAGE=kv 指定使用 KV。
 */
export function storageBackend(env: Env): "r2" | "kv" {
  if (env.FILE_STORAGE === "kv" && env.FILE_KV) return "kv";
  if (env.FILE_KV && !env.FILES) return "kv";
  if (env.FILES) return "r2";
  if (env.FILE_KV) return "kv";
  throw new Error("未绑定文件存储：请在 wrangler.jsonc 中配置 R2（FILES）或 KV（FILE_KV）");
}

export async function putStoredObject(env: Env, key: string, data: ArrayBuffer): Promise<void> {
  if (storageBackend(env) === "kv") {
    if (data.byteLength > MAX_KV_BYTES) throw new HttpError(400, "文件超过 KV 存储上限，请改用 R2 或上传更小的文件");
    await env.FILE_KV!.put(key, data);
    return;
  }
  await env.FILES!.put(key, data, {
    httpMetadata: { contentType: "application/octet-stream", cacheControl: "private, no-store" },
  });
}

export async function getStoredObject(env: Env, key: string): Promise<ArrayBuffer | null> {
  if (storageBackend(env) === "kv") {
    return (await env.FILE_KV!.get(key, "arrayBuffer")) ?? null;
  }
  const object = await env.FILES!.get(key);
  return object ? object.arrayBuffer() : null;
}

export async function deleteStoredObjects(env: Env, keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (storageBackend(env) === "kv") {
    await Promise.allSettled(keys.map((key) => env.FILE_KV!.delete(key)));
    return;
  }
  await Promise.allSettled(keys.map((key) => env.FILES!.delete(key)));
}

/** 校验并去重客户端传来的文件 ID，最多 5 个 */
export function normalizeFileIds(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new HttpError(400, "附件格式不正确");
  const ids = [...new Set(value.map((id) => String(id)))];
  if (ids.length > MAX_LOG_FILES) throw new HttpError(400, `最多上传 ${MAX_LOG_FILES} 个附件`);
  if (ids.some((id) => !/^[a-f0-9]{32}$/.test(id))) throw new HttpError(400, "附件 ID 格式不正确");
  return ids;
}

/** 将已上传但尚未绑定的日志附件绑定到日志 */
export async function bindLogFiles(env: Env, userId: number, logId: number, value: unknown) {
  const ids = normalizeFileIds(value);
  if (!ids.length) return;
  const { results } = await env.DB.prepare(
    `SELECT id, uploader_id, owner_user_id, scope, log_id FROM files WHERE id IN (${ids.map(() => "?").join(", ")})`,
  )
    .bind(...ids)
    .all<Pick<FileRow, "id" | "uploader_id" | "owner_user_id" | "scope" | "log_id">>();

  const byId = new Map(results.map((row) => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.uploader_id !== userId || row.owner_user_id !== userId || row.scope !== "log") {
      throw new HttpError(400, "附件不存在或无权使用");
    }
    if (row.log_id !== null && row.log_id !== logId) throw new HttpError(409, "附件已被其他日志使用");
  }

  const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM files WHERE log_id = ?").bind(logId).first<{ n: number }>();
  const pending = results.filter((row) => row.log_id === null);
  if ((existing?.n ?? 0) + pending.length > MAX_LOG_FILES) {
    throw new HttpError(400, `每条日志最多 ${MAX_LOG_FILES} 个附件`);
  }
  if (pending.length) {
    await env.DB.batch(
      pending.map((row) =>
        env.DB.prepare("UPDATE files SET log_id = ? WHERE id = ? AND uploader_id = ? AND log_id IS NULL").bind(logId, row.id, userId),
      ),
    );
  }
}

/** 移除并删除日志上的指定附件 */
export async function detachLogFiles(env: Env, userId: number, logId: number, value: unknown) {
  const ids = normalizeFileIds(value);
  if (!ids.length) return;
  const { results } = await env.DB.prepare(
    `SELECT id, r2_key FROM files
      WHERE log_id = ? AND uploader_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
  )
    .bind(logId, userId, ...ids)
    .all<{ id: string; r2_key: string }>();
  if (!results.length) return;
  await env.DB.prepare(`DELETE FROM files WHERE id IN (${results.map(() => "?").join(", ")})`)
    .bind(...results.map((row) => row.id))
    .run();
  await deleteStoredObjects(env, results.map((row) => row.r2_key));
}

export async function fileKeysForLog(env: Env, logId: number): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT r2_key FROM files WHERE log_id = ?").bind(logId).all<{ r2_key: string }>();
  return results.map((row) => row.r2_key);
}

export async function fileKeysForTask(env: Env, taskId: number): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT r2_key FROM files WHERE task_id = ?").bind(taskId).all<{ r2_key: string }>();
  return results.map((row) => row.r2_key);
}

export async function fileKeysForUser(env: Env, userId: number): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT r2_key FROM files WHERE uploader_id = ? OR owner_user_id = ?")
    .bind(userId, userId)
    .all<{ r2_key: string }>();
  return results.map((row) => row.r2_key);
}

export async function avatarKeysForUser(env: Env, userId: number): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT storage_key FROM avatars WHERE user_id = ?").bind(userId).all<{ storage_key: string }>();
  return results.map((row) => row.storage_key);
}
