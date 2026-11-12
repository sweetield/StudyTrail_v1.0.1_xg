export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** R2 存储桶（wrangler.jsonc 中默认自动创建）。与 FILE_KV 二选一即可。 */
  FILES?: R2Bucket;
  /** 可选：使用 KV 代替 R2 保存加密后的文件内容 */
  FILE_KV?: KVNamespace;
  /** 同时绑定 R2 与 KV 时，用 FILE_STORAGE=kv 指定使用 KV；默认 r2 */
  FILE_STORAGE?: string;
  /** 可选：32 字节统一加密密钥（Base64 / 64 位十六进制 / 32 字符）。未配置时自动生成并保存到 D1。 */
  FILE_ENCRYPTION_KEY?: string;
}

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: "admin" | "student";
  class_id: number | null;
  class_name: string | null;
  avatar_id: string | null;
  must_change_password: number;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: SessionUser; sessionId: string };
};
