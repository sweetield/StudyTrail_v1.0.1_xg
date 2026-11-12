import { Link } from "react-router";
import useSWR from "swr";
import { Activity, ClipboardCheck, Clock, ListTodo, Plus, Target, Users } from "lucide-react";
import type { ProgressStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";
import { formatMinutes, formatTime } from "@/lib/utils";
import { Badge, buttonVariants, Card, CardHeader, EmptyState, PageHeader, PageLoader, StatCard } from "@/components/ui";
import { StackedBar } from "@/components/stacked-bar";

export interface OverviewData {
  counts: { students: number; tasks: number; pending: number; week_minutes: number; week_active: number };
  completion: { assigned: number; approved: number | null };
  tasks: { id: number; title: string; due_date: string | null; assigned: number; approved: number; submitted: number; doing: number }[];
  activity: { kind: "progress" | "log"; at: number; user_name: string; task_title: string | null; detail: string; extra: number }[];
  leaders: { id: number; name: string; class_name: string | null; completed: number; minutes: number }[];
}

export default function AdminOverview() {
  const { data } = useSWR<OverviewData>("/api/admin/overview", { refreshInterval: 60000 });
  if (!data) return <PageLoader />;

  const { counts, completion } = data;
  const rate = completion.assigned ? Math.round(((completion.approved ?? 0) / completion.assigned) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="教学概览"
        description="实时掌握班级学习进度"
        action={
          <Link to="/admin/tasks/new" className={buttonVariants()}>
            <Plus /> 发布任务
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="在读学员" value={counts.students} icon={<Users />} />
        <StatCard label="已发布任务" value={counts.tasks} icon={<ListTodo />} />
        <Link to="/admin/reviews" className="rounded-xl transition-shadow hover:shadow-md [&>div]:h-full">
          <StatCard
            label="待审核"
            value={<span className={counts.pending ? "text-warning" : ""}>{counts.pending}</span>}
            hint={counts.pending ? "点击前往审核" : "全部处理完毕"}
            icon={<ClipboardCheck />}
          />
        </Link>
        <StatCard label="整体完成率" value={`${rate}%`} hint={`${completion.approved ?? 0} / ${completion.assigned} 人次`} icon={<Target />} />
        <StatCard label="近 7 天学习" value={formatMinutes(counts.week_minutes)} hint={`${counts.week_active} 人打卡`} icon={<Clock />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="任务完成情况"
            description="最近发布的任务"
            action={
              <Link to="/admin/tasks" className="text-sm text-primary hover:underline">
                全部任务
              </Link>
            }
          />
          {data.tasks.length ? (
            <ul className="divide-y">
              {data.tasks.map((t) => {
                const todo = Math.max(0, t.assigned - t.approved - t.submitted - t.doing);
                return (
                  <li key={t.id}>
                    <Link to={`/admin/tasks/${t.id}`} className="flex flex-col gap-2 px-5 py-3.5 hover:bg-muted/50">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">{t.title}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {t.approved}/{t.assigned} 完成
                        </span>
                      </div>
                      <StackedBar approved={t.approved} submitted={t.submitted} doing={t.doing} todo={todo} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<ListTodo />} title="还没有发布任务" action={<Link to="/admin/tasks/new" className="text-sm text-primary hover:underline">发布第一个任务</Link>} />
          )}
          <div className="flex flex-wrap gap-4 border-t px-5 py-3 text-xs text-muted-foreground">
            <Legend className="bg-primary" label="已完成" />
            <Legend className="bg-warning" label="待审核" />
            <Legend className="bg-primary/35" label="学习中" />
            <Legend className="bg-muted" label="未开始" />
          </div>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="学习之星" description="按完成任务数排序" />
            {data.leaders.length ? (
              <ol className="flex flex-col gap-1 p-2">
                {data.leaders.map((l, i) => (
                  <li key={l.id}>
                    <Link to={`/admin/students/${l.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
                      <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${i < 3 ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        {l.class_name && <p className="text-xs text-muted-foreground">{l.class_name}</p>}
                      </div>
                      <div className="text-right text-xs tabular-nums text-muted-foreground">
                        <p className="font-medium text-foreground">{l.completed} 个任务</p>
                        <p>{formatMinutes(l.minutes)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState icon={<Users />} title="暂无学员" />
            )}
          </Card>

          <Card>
            <CardHeader title="最新动态" />
            {data.activity.length ? (
              <ul className="flex flex-col gap-3 px-5 py-4">
                {data.activity.map((a, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-pretty">
                        <span className="font-medium">{a.user_name}</span>
                        {a.kind === "log" ? (
                          <>
                            {" 打卡 "}
                            <span className="text-muted-foreground">{formatMinutes(a.extra)}</span>
                            {a.task_title && <span className="text-muted-foreground">{` · ${a.task_title}`}</span>}
                          </>
                        ) : (
                          <>
                            {" 在 "}
                            <span className="text-muted-foreground">{a.task_title}</span> <ActivityBadge status={a.detail as ProgressStatus} percent={a.extra} />
                          </>
                        )}
                      </p>
                      {a.kind === "log" && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.detail}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatTime(a.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Activity />} title="暂无动态" />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ActivityBadge({ status, percent }: { status: ProgressStatus; percent: number }) {
  const meta = statusMeta(status);
  return <Badge tone={meta.tone}>{status === "doing" ? `进度 ${percent}%` : meta.label}</Badge>;
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-sm ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}
