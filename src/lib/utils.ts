import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PASSWORD_HINT = "至少 8 位，需同时包含字母和数字";
export const PASSWORD_PATTERN = "(?=.*[A-Za-z])(?=.*\\d).{8,72}";

const PASSWORD_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const PASSWORD_DIGITS = "23456789";

/** 生成易读的初始密码：去掉 0/O、1/l/I 等易混淆字符，保证同时含字母和数字 */
export function generatePassword(length = 10) {
  const random = crypto.getRandomValues(new Uint32Array(length));
  const chars = Array.from(random, (n, i) => (i % 3 === 2 ? PASSWORD_DIGITS[n % PASSWORD_DIGITS.length] : PASSWORD_CHARS[n % PASSWORD_CHARS.length]));
  return chars.join("");
}

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTime(ts?: number | null) {
  if (!ts) return "—";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(ts * 1000).toLocaleDateString("zh-CN");
}

export function formatMinutes(min: number) {
  if (!min) return "0 分钟";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} 分钟`;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export function dueInfo(due?: string | null): { label: string; tone: "muted" | "warning" | "destructive" } | null {
  if (!due) return null;
  const today = todayStr();
  const days = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
  if (days < 0) return { label: `已逾期 ${-days} 天`, tone: "destructive" };
  if (days === 0) return { label: "今天截止", tone: "warning" };
  if (days <= 3) return { label: `${days} 天后截止`, tone: "warning" };
  return { label: `${due} 截止`, tone: "muted" };
}

export function splitTags(tags?: string | null) {
  return (tags ?? "").split(",").filter(Boolean);
}
