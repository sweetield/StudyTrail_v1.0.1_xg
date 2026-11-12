import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** 当前时间（Unix 秒），每秒刷新，用于倒计时显示 */
export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

export function countdownInfo(dueAt: number, now = Math.floor(Date.now() / 1000)) {
  const remaining = Math.max(0, dueAt - now);
  const expired = dueAt <= now;
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return {
    remaining,
    expired,
    label: expired ? "已超时" : days > 0 ? `${days} 天 ${clock}` : clock,
  };
}

export function Countdown({ dueAt, className, prefix }: { dueAt: number; className?: string; prefix?: string }) {
  const now = useNow();
  const info = countdownInfo(dueAt, now);
  return (
    <span className={cn("font-medium tabular-nums", info.expired ? "text-destructive" : "text-warning", className)}>
      {prefix}
      {info.label}
    </span>
  );
}
