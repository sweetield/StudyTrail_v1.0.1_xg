import type { ProgressStatus } from "./types";

export const STATUS_META: Record<ProgressStatus | "todo", { label: string; tone: "muted" | "primary" | "warning" | "destructive" | "success" }> = {
  todo: { label: "未开始", tone: "muted" },
  doing: { label: "学习中", tone: "primary" },
  submitted: { label: "待审核", tone: "warning" },
  approved: { label: "已完成", tone: "success" },
  rejected: { label: "需修改", tone: "destructive" },
};

export const TASK_STATUS_LABEL = { published: "已发布", draft: "草稿", archived: "已归档" } as const;

export const PRIORITY_OPTIONS = [
  { value: 0, label: "未设置" },
  { value: 1, label: "低" },
  { value: 2, label: "中" },
  { value: 3, label: "高" },
] as const;

type PriorityTone = "muted" | "primary" | "warning" | "destructive" | "success" | "outline";

export const PRIORITY_META: Record<number, { label: string; tone: PriorityTone }> = {
  1: { label: "低优先级", tone: "outline" },
  2: { label: "中优先级", tone: "warning" },
  3: { label: "高优先级", tone: "destructive" },
};

export function priorityMeta(priority: number | null | undefined) {
  return priority ? (PRIORITY_META[priority] ?? null) : null;
}

export function statusMeta(status: ProgressStatus | null | undefined) {
  return STATUS_META[status ?? "todo"];
}
