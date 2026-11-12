import { todayStr } from "@/lib/utils";

export interface DailyRow {
  log_date: string;
  minutes: number;
  count: number;
}

export function lastNDays(n: number) {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(todayStr(x));
  }
  return out;
}

export function computeStreak(daily: DailyRow[]) {
  const set = new Set(daily.map((d) => d.log_date));
  const cursor = new Date();
  if (!set.has(todayStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (set.has(todayStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function StudyChart({ daily, days = 14 }: { daily: DailyRow[]; days?: number }) {
  const map = new Map(daily.map((d) => [d.log_date, d.minutes]));
  const range = lastNDays(days);
  const values = range.map((d) => map.get(d) ?? 0);
  const max = Math.max(60, ...values);
  const today = todayStr();

  return (
    <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`最近 ${days} 天学习时长柱状图`}>
      {range.map((date, i) => {
        const v = values[i];
        const h = v ? Math.max(8, (v / max) * 100) : 4;
        return (
          <div key={date} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="pointer-events-none absolute -top-1 z-10 hidden -translate-y-full rounded-md bg-foreground px-2 py-1 text-[11px] whitespace-nowrap text-background group-hover:block">
              {date.slice(5)} · {v} 分钟
            </span>
            <div className={`w-full rounded-md transition-colors ${v ? "bg-primary group-hover:bg-primary-hover" : "bg-muted"}`} style={{ height: `${h}%` }} />
            <span className={`text-[10px] tabular-nums ${date === today ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {Number(date.slice(8))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
