import { splitTags, todayStr } from "./utils";

export type ViewMode = "grid" | "list";
export type GroupBy = "none" | "tech" | "due" | "month";
export type SortBy = "priority" | "due" | "newest" | "title";
export type DueBucket = "overdue" | "today" | "week" | "month" | "later" | "none";

export const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "none", label: "不分组" },
  { key: "tech", label: "按学习技术" },
  { key: "due", label: "按截止日期" },
  { key: "month", label: "按发布月份" },
];

export const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "priority", label: "优先级优先" },
  { key: "due", label: "截止日期优先" },
  { key: "newest", label: "最新发布" },
  { key: "title", label: "按名称" },
];

export const DUE_BUCKETS: { key: DueBucket; label: string }[] = [
  { key: "overdue", label: "已逾期" },
  { key: "today", label: "今天截止" },
  { key: "week", label: "7 天内截止" },
  { key: "month", label: "30 天内截止" },
  { key: "later", label: "30 天以后" },
  { key: "none", label: "不限期" },
];

export interface TaskLike {
  id: number;
  title: string;
  tech_tags: string;
  due_date: string | null;
  created_at: number;
  priority?: number;
}

export interface TaskGroup<T> {
  key: string;
  label: string;
  kind: GroupBy;
  items: T[];
}

export function dueBucket(due: string | null): DueBucket {
  if (!due) return "none";
  const days = Math.round((Date.parse(due) - Date.parse(todayStr())) / 86400000);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

export function countTechs(tasks: TaskLike[]) {
  const counts = new Map<string, number>();
  for (const t of tasks) for (const tag of splitTags(t.tech_tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function countDueBuckets(tasks: TaskLike[]) {
  const counts = Object.fromEntries(DUE_BUCKETS.map((b) => [b.key, 0])) as Record<DueBucket, number>;
  for (const t of tasks) counts[dueBucket(t.due_date)]++;
  return counts;
}

const collator = new Intl.Collator("zh-CN");

function compareDue(a: TaskLike, b: TaskLike) {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  return 0;
}

export function sortTasks<T extends TaskLike>(tasks: T[], sort: SortBy) {
  const list = [...tasks];
  if (sort === "title") return list.sort((a, b) => collator.compare(a.title, b.title));
  if (sort === "newest") return list.sort((a, b) => b.created_at - a.created_at || b.id - a.id);
  if (sort === "priority") {
    return list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || compareDue(a, b) || b.created_at - a.created_at);
  }
  return list.sort((a, b) => compareDue(a, b) || b.created_at - a.created_at);
}

function monthKey(ts: number) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function groupTasks<T extends TaskLike>(tasks: T[], groupBy: GroupBy): TaskGroup<T>[] {
  if (groupBy === "none") return [{ key: "all", label: "全部", kind: groupBy, items: tasks }];

  if (groupBy === "due") {
    return DUE_BUCKETS.map((b) => ({ key: b.key, label: b.label, kind: groupBy, items: tasks.filter((t) => dueBucket(t.due_date) === b.key) })).filter(
      (g) => g.items.length,
    );
  }

  if (groupBy === "month") {
    const map = new Map<string, T[]>();
    for (const t of tasks) {
      const key = monthKey(t.created_at);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, items]) => {
        const [y, m] = key.split("-");
        return { key, label: `${y} 年 ${Number(m)} 月`, kind: groupBy, items };
      });
  }

  const groups = countTechs(tasks).map(({ tag }) => ({ key: tag, label: tag, kind: groupBy, items: tasks.filter((t) => splitTags(t.tech_tags).includes(tag)) }));
  const untagged = tasks.filter((t) => !t.tech_tags);
  return untagged.length ? [...groups, { key: "__untagged", label: "未标注技术", kind: groupBy, items: untagged }] : groups;
}
