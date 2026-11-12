import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import useSWR, { mutate } from "swr";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AlarmClock, Archive, ArrowLeft, BellOff, Copy, Download, ExternalLink, Pencil, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { ProgressStatus, Step } from "@/lib/types";
import { statusMeta } from "@/lib/status";
import { cn, dueInfo, formatTime, splitTags } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Badge, Button, buttonVariants, Card, CardHeader, EmptyState, PageLoader, ProgressBar, StatCard, TechTag } from "@/components/ui";
import { Countdown } from "@/components/countdown";
import { Markdown } from "@/components/markdown";
import { PriorityBadge } from "@/components/priority-badge";
import { ReviewDialog, type ReviewTarget } from "@/components/review-dialog";
import { StarScore } from "@/components/star-rating";
import { Avatar } from "@/components/avatar";
import { ExportDialog } from "@/components/export-dialog";
import { UrgeDialog } from "@/components/urge-dialog";
import { TASK_STATUS_LABEL } from "@/lib/status";

interface RosterRow {
  user_id: number;
  name: string;
  username: string;
  class_name: string | null;
  avatar_id: string | null;
  status: ProgressStatus | null;
  percent: number;
  note: string | null;
  link: string | null;
  review_comment: string | null;
  score: number | null;
  submitted_at: number | null;
  updated_at: number | null;
  urge_due_at: number | null;
  urge_message: string | null;
}

interface Detail {
  task: {
    id: number;
    title: string;
    description: string;
    tech_tags: string;
    class_name: string | null;
    class_names: string | null;
    due_date: string | null;
    status: "draft" | "published" | "archived";
    require_review: number;
    priority: number;
  };
  steps: Step[];
  roster: RosterRow[];
  class_ids: number[];
  excluded_user_ids: number[];
}

const FILTERS: { key: ProgressStatus | "todo" | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "submitted", label: "待审核" },
  { key: "doing", label: "学习中" },
  { key: "rejected", label: "需修改" },
  { key: "approved", label: "已完成" },
  { key: "todo", label: "未开始" },
];

export default function AdminTaskDetail() {
  const { id } = useParams();
  const key = `/api/admin/tasks/${id}`;
  const { data } = useSWR<Detail>(key);
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [urgeOpen, setUrgeOpen] = useState(false);
  useDocumentTitle(data?.task.title);

  if (!data) return <PageLoader />;
  const { task, steps, roster } = data;
  const count = (k: (typeof FILTERS)[number]["key"]) => (k === "all" ? roster.length : roster.filter((r) => (r.status ?? "todo") === k).length);
  const list = filter === "all" ? roster : roster.filter((r) => (r.status ?? "todo") === filter);
  const avg = roster.length ? Math.round(roster.reduce((s, r) => s + r.percent, 0) / roster.length) : 0;
  const due = dueInfo(task.due_date);

  async function setStatus(status: "published" | "archived") {
    await api.put(key, {
      ...task,
      steps: steps.map((s) => ({ id: s.id, title: s.title })),
      class_ids: data!.class_ids,
      excluded_user_ids: data!.excluded_user_ids,
      status,
    });
    await mutate((k) => typeof k === "string" && k.startsWith("/api/admin/"));
    toast(status === "archived" ? "任务已归档，学员端不再显示" : "任务已重新发布");
  }

  async function duplicate() {
    try {
      const res = await api.post<{ task: { id: number } }>(`${key}/duplicate`);
      await mutate((k) => typeof k === "string" && k.startsWith("/api/admin/"));
      toast("已复制为草稿，可修改后发布");
      navigate(`/admin/tasks/${res.task.id}/edit`);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function remove() {
    if (!confirm(`确定删除「${task.title}」吗？所有学员的进度记录将一并删除，且无法恢复。`)) return;
    await api.del(key);
    await mutate((k) => typeof k === "string" && k.startsWith("/api/admin/"));
    toast("任务已删除");
    navigate("/admin/tasks", { replace: true });
  }

  async function cancelUrge(userId: number) {
    try {
      await api.del(`${key}/urge/${userId}`);
      await mutate();
      toast("已取消督促");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link to="/admin/tasks" className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> 学习任务
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={task.status === "published" ? "primary" : "muted"}>{TASK_STATUS_LABEL[task.status]}</Badge>
              <PriorityBadge priority={task.priority} />
              <Badge tone="outline">{task.class_names ?? "全部学员"}</Badge>
              {data.excluded_user_ids.length > 0 && <Badge tone="warning">排除 {data.excluded_user_ids.length} 人</Badge>}
              {due && <Badge tone={due.tone}>{due.label}</Badge>}
              {!task.require_review && <Badge tone="outline">无需审核</Badge>}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{task.title}</h1>
            <div className="flex flex-wrap gap-1.5">
              {splitTags(task.tech_tags).map((t) => (
                <TechTag key={t}>{t}</TechTag>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap shrink-0 gap-2">
            <Button variant="outline" onClick={() => setUrgeOpen(true)} disabled={!roster.length}>
              <AlarmClock /> 督促学员
            </Button>
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download /> 导出
            </Button>
            <Link to={`/admin/tasks/${task.id}/edit`} className={buttonVariants({ variant: "outline" })}>
              <Pencil /> 编辑
            </Link>
            {task.status === "published" ? (
              <Button variant="outline" onClick={() => setStatus("archived")}>
                <Archive /> 归档
              </Button>
            ) : task.status === "archived" ? (
              <Button variant="outline" onClick={() => setStatus("published")}>
                重新发布
              </Button>
            ) : null}
            <Button variant="outline" size="icon" onClick={duplicate} aria-label="复制任务" title="复制任务">
              <Copy />
            </Button>
            <Button variant="destructive-ghost" size="icon" onClick={remove} aria-label="删除任务">
              <Trash2 />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="应完成人数" value={roster.length} />
        <StatCard label="已完成" value={count("approved")} hint={roster.length ? `${Math.round((count("approved") / roster.length) * 100)}%` : undefined} />
        <StatCard label="待审核" value={<span className={count("submitted") ? "text-warning" : ""}>{count("submitted")}</span>} />
        <StatCard label="平均进度" value={`${avg}%`} />
      </div>

      <Card>
        <CardHeader title="学员进度" description="点击「审核」查看学员笔记与作品链接" />
        <div className="flex gap-1 overflow-x-auto border-b px-5 py-2" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn("shrink-0 rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted", filter === f.key && "bg-primary-soft font-medium text-primary hover:bg-primary-soft")}
            >
              {f.label} <span className="text-xs tabular-nums">{count(f.key)}</span>
            </button>
          ))}
        </div>
        {list.length ? (
          <ul className="divide-y">
            {list.map((r) => {
              const meta = statusMeta(r.status);
              return (
                <li key={r.user_id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                  <Link to={`/admin/students/${r.user_id}`} className="flex min-w-0 items-center gap-3 sm:w-48">
                    <Avatar name={r.name} avatarId={r.avatar_id} className="size-8 text-xs" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium hover:text-primary">{r.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.class_name ?? r.username}</span>
                    </span>
                  </Link>
                  <div className="flex flex-1 items-center gap-3">
                    <ProgressBar value={r.percent} tone={r.status === "submitted" ? "warning" : r.status ? "primary" : "muted"} className="max-w-48" />
                    <span className="w-9 text-xs tabular-nums text-muted-foreground">{r.percent}%</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {r.status === "approved" && <StarScore score={r.score} />}
                    {r.urge_due_at && r.status !== "approved" && (
                      <span className="flex items-center gap-1 text-xs text-destructive" title={r.urge_message || "辅导员督促"}>
                        <AlarmClock className="size-3.5" aria-hidden="true" />
                        <Countdown dueAt={r.urge_due_at} />
                      </span>
                    )}
                    {r.link && (
                      <a href={r.link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" aria-label="打开作品链接">
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-xs text-muted-foreground">{formatTime(r.updated_at)}</span>
                    {r.urge_due_at && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => cancelUrge(r.user_id)}
                        aria-label={`取消对 ${r.name} 的督促`}
                        title="取消督促"
                      >
                        <BellOff className="size-4" />
                      </Button>
                    )}
                    {r.status === "submitted" && (
                      <Button size="sm" onClick={() => setReview({ ...r, task_id: task.id, user_name: r.name, task_title: task.title })}>
                        审核
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Users />} title="没有对应状态的学员" />
        )}
      </Card>

      {(task.description || steps.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {task.description && (
            <Card>
              <CardHeader title="任务说明" />
              <Markdown source={task.description} className="px-5 py-4" />
            </Card>
          )}
          {steps.length > 0 && (
            <Card>
              <CardHeader title={`学习步骤（${steps.length}）`} />
              <ol className="flex flex-col gap-2 px-5 py-4 text-sm">
                {steps.map((s, i) => (
                  <li key={s.id} className="flex gap-3">
                    <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      )}

      <UrgeDialog
        open={urgeOpen}
        onClose={() => setUrgeOpen(false)}
        taskId={task.id}
        taskTitle={task.title}
        roster={roster}
        onDone={() => mutate()}
      />
      <ReviewDialog target={review} onClose={() => setReview(null)} />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tasks={[{ id: task.id, title: task.title }]}
        mode="admin"
      />
    </div>
  );
}
