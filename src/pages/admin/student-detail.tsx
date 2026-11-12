import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import useSWR from "swr";
import { ArrowLeft, ArrowUpRight, ExternalLink, NotebookPen, Pencil, Send, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { FileMeta, LogReply, ProgressStatus, StudyLog } from "@/lib/types";
import { statusMeta } from "@/lib/status";
import { cn, formatMinutes, formatTime } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { FileChips, ReplyThread } from "@/components/attachments";
import { LogDialog } from "@/components/log-dialog";
import { Markdown } from "@/components/markdown";
import { Badge, Button, Card, CardHeader, EmptyState, PageLoader, ProgressBar, StatCard, Textarea } from "@/components/ui";
import { StarScore } from "@/components/star-rating";

type AdminLog = StudyLog & { task_title: string | null; files: FileMeta[]; replies: LogReply[] };

interface Detail {
  student: { id: number; username: string; name: string; class_name: string | null; avatar_id: string | null; active: number; last_login_at: number | null; created_at: number };
  tasks: { id: number; title: string; due_date: string | null; status: ProgressStatus | null; percent: number; note: string | null; link: string | null; score: number | null; updated_at: number | null }[];
  files: (FileMeta & { task_id: number | null })[];
  logs: AdminLog[];
}

export default function AdminStudentDetail() {
  const { id } = useParams();
  const { data, error, mutate } = useSWR<Detail>(`/api/admin/students/${id}`);
  const toast = useToast();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [editingLog, setEditingLog] = useState<StudyLog | null>(null);
  if (error) return <EmptyState title="学员不存在" />;
  if (!data) return <PageLoader />;
  const { student, tasks, logs } = data;
  const done = tasks.filter((t) => t.status === "approved").length;
  const avg = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.percent, 0) / tasks.length) : 0;

  const filesByTask = new Map<number, FileMeta[]>();
  for (const file of data.files ?? []) {
    if (file.task_id == null) continue;
    const list = filesByTask.get(file.task_id) ?? [];
    list.push(file);
    filesByTask.set(file.task_id, list);
  }

  const logStats = new Map<number, { count: number; minutes: number }>();
  for (const l of logs) {
    if (l.task_id == null) continue;
    const s = logStats.get(l.task_id) ?? { count: 0, minutes: 0 };
    logStats.set(l.task_id, { count: s.count + 1, minutes: s.minutes + l.minutes });
  }
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const visibleLogs = selectedTask ? logs.filter((l) => l.task_id === selectedTask.id) : logs;
  const visibleMinutes = visibleLogs.reduce((s, l) => s + l.minutes, 0);
  const taskOptions = tasks.map((t) => ({ id: t.id, title: t.title }));
  if (editingLog?.task_id && !taskOptions.some((t) => t.id === editingLog.task_id)) {
    taskOptions.push({ id: editingLog.task_id, title: editingLog.task_title ?? `任务 #${editingLog.task_id}` });
  }

  async function removeLog(log: StudyLog) {
    if (!confirm(`确定删除 ${log.log_date} 的这条日志吗？日志附件也会一并删除，且无法恢复。`)) return;
    try {
      await api.del(`/api/admin/logs/${log.id}`);
      await mutate();
      toast("日志已删除");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function removeTaskFile(id: string) {
    if (!confirm("确定删除这个作品附件吗？删除后无法恢复。")) return;
    try {
      await api.del(`/api/files/${id}`);
      await mutate();
      toast("作品附件已删除");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/students" className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> 学员管理
      </Link>
      <div className="flex items-center gap-4">
        <Avatar name={student.name} avatarId={student.avatar_id} className="size-14 text-xl" />
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {student.name}
            {!student.active && <Badge>已停用</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {student.username} · {student.class_name ?? "未分班"} · 最近登录 {formatTime(student.last_login_at)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="已完成任务" value={`${done}/${tasks.length}`} />
        <StatCard label="平均进度" value={`${avg}%`} />
        <StatCard label="待审核" value={tasks.filter((t) => t.status === "submitted").length} />
        <StatCard label="近期学习" value={formatMinutes(logs.reduce((s, l) => s + l.minutes, 0))} hint={`最近 ${logs.length} 条日志`} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="任务进度" description="点击任务，右侧只显示该任务的学习日志" />
          {tasks.length ? (
            <ul className="divide-y">
              {tasks.map((t) => {
                const meta = statusMeta(t.status);
                const stats = logStats.get(t.id);
                const selected = t.id === selectedTaskId;
                return (
                  <li key={t.id} className={cn("relative transition-colors", selected ? "bg-primary-soft/50" : "hover:bg-muted/40")}>
                    {selected && <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />}
                    <button
                      type="button"
                      onClick={() => setSelectedTaskId(selected ? null : t.id)}
                      aria-pressed={selected}
                      className="flex w-full flex-col gap-2 px-5 py-3.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <div className="flex items-center justify-between gap-3 pr-8">
                        <span className={cn("truncate text-sm font-medium", selected && "text-primary")}>{t.title}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {t.status === "approved" && <StarScore score={t.score} />}
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <ProgressBar value={t.percent} tone={t.status === "submitted" ? "warning" : t.status ? "primary" : "muted"} />
                        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{t.percent}%</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{stats ? `${stats.count} 条日志 · ${formatMinutes(stats.minutes)}` : "暂无关联日志"}</span>
                    </button>
                    <Link
                      to={`/admin/tasks/${t.id}`}
                      className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`查看任务「${t.title}」`}
                      title="查看任务"
                    >
                      <ArrowUpRight className="size-4" />
                    </Link>
                    {(t.note || t.link) && (
                      <div className="mx-5 mb-3.5 -mt-1 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                        {t.note && <p className="line-clamp-2 whitespace-pre-wrap">{t.note}</p>}
                        {t.link && (
                          <a href={t.link} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 break-all text-primary hover:underline">
                            <ExternalLink className="size-3 shrink-0" /> {t.link}
                          </a>
                        )}
                      </div>
                    )}
                    {!!filesByTask.get(t.id)?.length && (
                      <div className="mx-5 mb-3.5">
                        <p className="mb-1.5 text-xs text-muted-foreground">作品附件（可删除不合规文件）</p>
                        <FileChips files={filesByTask.get(t.id)!} onRemove={removeTaskFile} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="暂无分配的任务" />
          )}
        </Card>

        <Card className="lg:sticky lg:top-6 lg:col-span-2">
          <CardHeader
            title="学习日志"
            description={selectedTask ? `「${selectedTask.title}」· ${visibleLogs.length} 条 · ${formatMinutes(visibleMinutes)}` : `全部任务 · ${logs.length} 条`}
            action={
              selectedTask && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedTaskId(null)}>
                  <X aria-hidden="true" /> 显示全部
                </Button>
              )
            }
          />
          {visibleLogs.length ? (
            <ul className="divide-y lg:max-h-[70vh] lg:overflow-y-auto" aria-live="polite">
              {visibleLogs.map((l) => (
                <LogRow key={l.id} log={l} showTask={!selectedTask} onEdit={() => setEditingLog(l)} onDelete={() => removeLog(l)} onReplied={() => mutate()} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<NotebookPen />} title={selectedTask ? "该任务暂无学习日志" : "暂无日志"} />
          )}
        </Card>
      </div>

      {editingLog && (
        <LogDialog
          key={editingLog.id}
          open={!!editingLog}
          onClose={() => setEditingLog(null)}
          tasks={taskOptions}
          editing={editingLog}
          admin
          onSaved={() => mutate()}
        />
      )}
    </div>
  );
}

function LogRow({
  log,
  showTask,
  onEdit,
  onDelete,
  onReplied,
}: {
  log: AdminLog;
  showTask: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReplied: () => void;
}) {
  const toast = useToast();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitReply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/logs/${log.id}/replies`, { content: reply });
      setReply("");
      onReplied();
      toast("回复已发送，学员会收到通知");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-1.5 px-5 py-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span>{log.log_date}</span>
          <span className="tabular-nums">{formatMinutes(log.minutes)}</span>
        </span>
        <span className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label="编辑日志" title="编辑日志">
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="destructive-ghost" size="icon" className="size-7" onClick={onDelete} aria-label="删除日志" title="删除日志">
            <Trash2 className="size-3.5" />
          </Button>
        </span>
      </div>
      <Markdown source={log.content} />
      {!!log.files.length && <FileChips files={log.files} className="mt-1" />}
      <ReplyThread replies={log.replies} />
      {showTask && log.task_title && <span className="text-xs text-muted-foreground">关联：{log.task_title}</span>}
      <form onSubmit={submitReply} className="mt-1 flex items-end gap-2">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="回复学员的日志或答疑…"
          className="min-h-16 text-sm"
          aria-label={`回复 ${log.log_date} 的日志`}
        />
        <Button type="submit" size="sm" loading={busy} disabled={!reply.trim()}>
          <Send /> 回复
        </Button>
      </form>
    </li>
  );
}
