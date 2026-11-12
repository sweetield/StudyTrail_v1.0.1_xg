export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 429 | 500, message: string) {
    super(message);
  }
}

export function str(value: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  const { min = 1, max = 200, optional = false } = opts;
  if (value === undefined || value === null || value === "") {
    if (optional) return "";
    throw new HttpError(400, `${field}不能为空`);
  }
  if (typeof value !== "string") throw new HttpError(400, `${field}格式不正确`);
  const v = value.trim();
  if (!optional && v.length < min) throw new HttpError(400, `${field}至少 ${min} 个字符`);
  if (v.length > max) throw new HttpError(400, `${field}不能超过 ${max} 个字符`);
  return v;
}

export function int(value: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): number | null {
  if (value === undefined || value === null || value === "") {
    if (opts.optional) return null;
    throw new HttpError(400, `${field}不能为空`);
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, `${field}必须是整数`);
  if (opts.min !== undefined && n < opts.min) throw new HttpError(400, `${field}不能小于 ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new HttpError(400, `${field}不能大于 ${opts.max}`);
  return n;
}

export function username(value: unknown): string {
  const v = str(value, "用户名", { min: 2, max: 32 });
  if (!/^[a-zA-Z0-9_.-]+$/.test(v)) throw new HttpError(400, "用户名只能包含字母、数字、下划线、点或短横线");
  return v;
}

export function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 8) throw new HttpError(400, "密码至少 8 位");
  if (value.length > 72) throw new HttpError(400, "密码不能超过 72 位");
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) throw new HttpError(400, "密码需同时包含字母和数字");
  return value;
}

export function dateStr(value: unknown, field: string, optional = true): string | null {
  if (!value) {
    if (optional) return null;
    throw new HttpError(400, `${field}不能为空`);
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${field}格式应为 YYYY-MM-DD`);
  return value;
}

export function url(value: unknown): string {
  const v = str(value, "链接", { optional: true, max: 500 });
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw new HttpError(400, "链接必须以 http:// 或 https:// 开头");
  }
}
