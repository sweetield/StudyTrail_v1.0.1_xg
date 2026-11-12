import { useState } from "react";
import useSWR from "swr";
import { Lock, NotebookPen, PenLine, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { StudentTask, StudyLog } from "@/lib/types";
import { cn, formatMinutes } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, StatCard } from "@/components/ui";
import { StudyChart, computeStreak, type DailyRow } from "@/components/study-chart";
import { FileChips, ReplyThread } from "@/components/attachments";
import { LogDialog } from "@/components/log-dialog";
import { Markdown } from "@/components/markdown";

type TaskFilter = "all" | "none" | number;

export default function StudentLogs() {
  const { data, mutate } = useSWR<{ logs: StudyLog[]; daily: DailyRow[] }>("/api/me/logs");
  const { data: taskData } = useSWR<{ tasks: StudentTask[] }>("/api/me/tasks");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StudyLog | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const toast = useToast();

  if (!data) return <PageLoader />;

  const taskOptions = new Map<number, { title: string; count: number }>();
  let unlinked = 0;
  for (const l of data.logs) {
    if (l.task_id == null) {
      unlinked++;
      continue;
    }
    const opt = taskOptions.get(l.task_id);
    taskOptions.set(l.task_id, { title: opt?.title ?? l.task_title ?? "已删除的任务", count: (opt?.count ?? 0) + 1 });
  }
  const activeFilter: TaskFilter = typeof taskFilter === "number" && !taskOptions.has(taskFilter) ? "all" : taskFilter;
  const filteredLogs = data.logs.filter((l) => (activeFilter === "all" ? true : activeFilter === "none" ? l.task_id == null : l.task_id === activeFilter));
  const filters: { key: TaskFilter; label: string; count: number }[] = [
    { key: "all", label: "全部", count: data.logs.length },
    ...[...taskOptions].map(([key, o]) => ({ key, label: o.title, count: o.count })),
    ...(unlinked ? [{ key: "none" as const, label: "未关联任务", count: unlinked }] : []),
  ];

  const groups = new Map<string, StudyLog[]>();
  for (const l of filteredLogs) groups.set(l.log_date, [...(groups.get(l.log_date) ?? []), l]);
  const total = data.daily.reduce((s, d) => s + d.minutes, 0);

  async function remove(id: number) {
    if (!confirm("确定删除这条日志吗？")) return;
    await mutate(
      async () => {
        await api.del(`/api/me/logs/${id}`);
        return undefined;
      },
      { optimisticData: { ...data!, logs: data!.logs.filter((l) => l.id !== id) }, rollbackOnError: true, populateCache: false },
    ).catch((e) => toast((e as Error).message, "error"));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="学习日志"
        description="每天记录一点点，见证自己的成长"
        action={
          <Button onClick={() => setOpen(true)}>
            <PenLine /> 学习打卡
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="累计时长" value={formatMinutes(total)} />
        <StatCard label="打卡天数" value={`${data.daily.length} 天`} />
        <StatCard label="连续打卡" value={`${computeStreak(data.daily)} 天`} />
      </div>

      <Card>
        <CardHeader title="最近 30 天" />
        <div className="overflow-x-auto px-5 pt-6 pb-4">
          <div className="min-w-[560px]">
            <StudyChart daily={data.daily} days={30} />
          </div>
        </div>
      </Card>

      {data.logs.length > 0 && filters.length > 2 && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1 self-start overflow-x-auto rounded-lg bg-muted p-1 max-w-full" role="tablist" aria-label="按任务筛选日志">
            {filters.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={activeFilter === f.key}
                onClick={() => setTaskFilter(f.key)}
                className={cn(
                  "flex max-w-48 shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors",
                  activeFilter === f.key && "bg-card font-medium text-foreground shadow-sm",
                )}
              >
                <span className="truncate">{f.label}</span>
                <span className="text-xs tabular-nums opacity-70">{f.count}</span>
              </button>
            ))}
          </div>
          {activeFilter !== "all" && (
            <p className="text-xs text-muted-foreground">
              {filteredLogs.length} 条 · 共 {formatMinutes(filteredLogs.reduce((s, l) => s + l.minutes, 0))}
            </p>
          )}
        </div>
      )}

      {groups.size ? (
        <div className="flex flex-col gap-5">
          {[...groups].map(([date, logs]) => (
            <section key={date} aria-label={date}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                {date}
                <span className="text-xs font-normal text-muted-foreground">{formatMinutes(logs.reduce((s, l) => s + l.minutes, 0))}</span>
              </h2>
              <Card className="divide-y">
                {logs.map((l) => (
                  <div key={l.id} className="group flex items-start gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium tabular-nums text-primary">{formatMinutes(l.minutes)}</span>
                        {l.task_title && activeFilter === "all" && <Badge tone="outline">{l.task_title}</Badge>}
                      </div>
                      <Markdown source={l.content} />
                      {l.files && l.files.length > 0 && <FileChips files={l.files} className="mt-2" />}
                      <ReplyThread replies={l.replies} />
                    </div>
                    {l.editable === false ? (
                      <span
                        className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                        title="已有辅导员留言或产生了更新的学习日志，这条日志不能再修改"
                      >
                        <Lock className="size-3.5" aria-hidden="true" /> 已锁定
                      </span>
                    ) : (
                      <div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(l)} aria-label="编辑日志">
                          <Pencil />
                        </Button>
                        <Button variant="destructive-ghost" size="icon" onClick={() => remove(l.id)} aria-label="删除日志">
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<NotebookPen />} title="还没有学习日志" description="点击右上角“学习打卡”记录第一条" />
        </Card>
      )}

      <LogDialog open={open} onClose={() => setOpen(false)} tasks={(taskData?.tasks ?? []).filter((t) => t.status !== "approved")} />
      <LogDialog key={editing?.id ?? "none"} open={!!editing} onClose={() => setEditing(null)} tasks={taskData?.tasks ?? []} editing={editing} />
    </div>
  );
}
