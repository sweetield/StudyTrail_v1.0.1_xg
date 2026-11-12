import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import useSWR, { mutate as globalMutate } from "swr";
import { AlarmClock, ArrowLeft, Check, CheckCircle2, ExternalLink, MessageSquareText, PenLine, Send, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import type { FileMeta, Progress, ProgressEvent, Step, StudyLog } from "@/lib/types";
import { ProgressTimeline } from "@/components/progress-timeline";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { statusMeta } from "@/lib/status";
import { cn, dueInfo, formatMinutes, formatTime, splitTags } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageLoader, ProgressBar, TechTag, Textarea } from "@/components/ui";
import { FileChips, FileUploader, ReplyThread } from "@/components/attachments";
import { Countdown } from "@/components/countdown";
import { LogDialog } from "@/components/log-dialog";
import { Markdown } from "@/components/markdown";
import { PriorityBadge } from "@/components/priority-badge";
import { SCORE_LABELS, StarScore } from "@/components/star-rating";

interface Detail {
  task: {
    id: number;
    title: string;
    description: string;
    tech_tags: string;
    due_date: string | null;
    require_review: number;
    priority: number;
    created_at: number;
    urge_due_at?: number | null;
    urge_message?: string | null;
  };
  steps: Step[];
  progress: Progress | null;
  files: FileMeta[];
  logs: StudyLog[];
  events: ProgressEvent[];
}

export default function StudentTaskDetail() {
  const { id } = useParams();
  const key = `/api/me/tasks/${id}`;
  const { data, error, mutate } = useSWR<Detail>(key);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  useDocumentTitle(data?.task.title);

  if (error) return <EmptyState title="任务不存在或未发布" action={<Link to="/app/tasks" className="text-sm text-primary hover:underline">返回任务列表</Link>} />;
  if (!data) return <PageLoader />;

  const { task, steps, progress, files = [], logs, events } = data;
  const status = progress?.status ?? null;
  const meta = statusMeta(status);
  const locked = status === "submitted" || status === "approved";
  const doneCount = steps.filter((s) => s.done).length;
  const percent = progress?.percent ?? 0;
  const allDone = steps.length === 0 || doneCount === steps.length;
  const due = status === "approved" ? null : dueInfo(task.due_date);
  const refreshLists = () => globalMutate("/api/me/tasks");

  async function toggleStep(step: Step) {
    if (locked) return;
    const nextDone = !step.done;
    // 基于缓存中的最新数据合并，避免连续快速勾选时后返回的请求覆盖其他步骤的状态
    const applyToggle = (cur: Detail): Detail => {
      const nextSteps = cur.steps.map((s) => (s.id === step.id ? { ...s, done: nextDone } : s));
      const percent = Math.floor((nextSteps.filter((s) => s.done).length * 100) / nextSteps.length);
      const prev = cur.progress ?? ({} as Progress);
      return { ...cur, steps: nextSteps, progress: { ...prev, status: prev.status === "rejected" ? "rejected" : "doing", percent } };
    };
    type StepResult = { progress: { status: Progress["status"]; percent: number } };
    await globalMutate<Detail, StepResult>(key, api.put<StepResult>(`${key}/steps/${step.id}`, { done: nextDone }), {
      optimisticData: (cur) => applyToggle(cur ?? data!),
      populateCache: (res, cur) => {
        const next = applyToggle(cur ?? data!);
        return { ...next, progress: { ...next.progress!, status: res.progress.status } };
      },
      rollbackOnError: true,
      revalidate: false,
    }).catch((e) => toast((e as Error).message, "error"));
    refreshLists();
  }

  async function saveNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy("save");
    try {
      const res = await api.put<{ progress: Progress }>(`${key}/progress`, {
        note: form.get("note"),
        link: form.get("link"),
        percent: steps.length ? undefined : Number(form.get("percent")),
      });
      await mutate({ ...data!, progress: res.progress }, { revalidate: false });
      refreshLists();
      toast("学习记录已保存");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function action(kind: "submit" | "withdraw") {
    setBusy(kind);
    try {
      const res = await api.post<{ progress: Progress }>(`${key}/${kind}`);
      // 立即展示新状态，并重新拉取以更新提交与审核记录
      await mutate({ ...data!, progress: res.progress });
      refreshLists();
      toast(kind === "withdraw" ? "已撤回，可以继续修改" : res.progress.status === "approved" ? "恭喜完成任务" : "已提交，等待辅导员审核");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function addFile(file: FileMeta) {
    await mutate({ ...data!, files: [...files, file] }, { revalidate: false });
  }

  async function removeFile(id: string) {
    await mutate({ ...data!, files: files.filter((file) => file.id !== id) }, { revalidate: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link to="/app/tasks" className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> 我的任务
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <PriorityBadge priority={task.priority} />
          {due && <Badge tone={due.tone}>{due.label}</Badge>}
          {!task.require_review && <Badge tone="outline">无需审核</Badge>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{task.title}</h1>
        {splitTags(task.tech_tags).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {splitTags(task.tech_tags).map((t) => (
              <TechTag key={t}>{t}</TechTag>
            ))}
          </div>
        )}
      </div>

      {task.urge_due_at && status !== "approved" && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive-soft p-4 text-sm text-destructive">
          <AlarmClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium">
              辅导员督促你尽快完成，剩余时间：<Countdown dueAt={task.urge_due_at} />
            </p>
            {task.urge_message && <Markdown source={task.urge_message} className="text-sm text-destructive/90" />}
          </div>
        </div>
      )}

      {progress && (progress.review_comment || progress.score) && (status === "rejected" || status === "approved") && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4 text-sm",
            status === "rejected" ? "border-destructive/25 bg-destructive-soft text-destructive" : "border-primary/20 bg-primary-soft text-primary",
          )}
        >
          <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">{status === "rejected" ? "辅导员退回意见" : "辅导员评价"}</p>
            {status === "approved" && progress.score && (
              <p className="flex items-center gap-2">
                <StarScore score={progress.score} />
                <span className="text-xs">{SCORE_LABELS[progress.score]}</span>
              </p>
            )}
            {progress.review_comment && <Markdown source={progress.review_comment} />}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-6">
          {task.description && (
            <Card>
              <CardHeader title="任务说明" />
              <Markdown source={task.description} className="px-5 py-4" />
            </Card>
          )}

          {steps.length > 0 && (
            <Card>
              <CardHeader title="学习步骤" description={`已完成 ${doneCount} / ${steps.length}，勾选后自动保存`} />
              <ul className="flex flex-col p-2">
                {steps.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => toggleStep(s)}
                      disabled={locked}
                      aria-pressed={!!s.done}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                          s.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                        )}
                      >
                        {s.done && <Check className="size-4" strokeWidth={3} />}
                      </span>
                      <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <span className={cn("text-sm", s.done && "text-muted-foreground line-through")}>{s.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="order-last lg:order-none">
            <CardHeader
              title="本任务学习日志"
              description={`共 ${logs.length} 条 · ${formatMinutes(logs.reduce((s, l) => s + l.minutes, 0))}`}
              action={
                <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
                  <PenLine /> 打卡
                </Button>
              }
            />
            {logs.length ? (
              <ul className="divide-y">
                {logs.map((l) => (
                  <li key={l.id} className="flex gap-4 px-5 py-3">
                    <div className="w-20 shrink-0 text-xs text-muted-foreground">
                      <p>{l.log_date}</p>
                      <p className="mt-0.5 tabular-nums">{formatMinutes(l.minutes)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Markdown source={l.content} />
                      {l.files && l.files.length > 0 && <FileChips files={l.files} className="mt-2" />}
                      <ReplyThread replies={l.replies} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="还没有日志" description="学习时随手记录，方便复盘和老师了解你的情况" />
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <div className="flex flex-col gap-3 border-b p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">完成进度</span>
                <span className="text-3xl font-semibold tabular-nums">{percent}%</span>
              </div>
              <ProgressBar value={percent} tone={status === "submitted" ? "warning" : "primary"} />
              {progress?.updated_at && <p className="text-xs text-muted-foreground">最近更新：{formatTime(progress.updated_at)}</p>}
            </div>

            <form onSubmit={saveNote} className="flex flex-col gap-4 p-5" key={`${status}:${progress?.note ?? ""}:${progress?.link ?? ""}`}>
              {steps.length === 0 && (
                <Field label="手动填写进度" htmlFor="percent">
                  <div className="flex items-center gap-3">
                    <input
                      id="percent"
                      name="percent"
                      type="range"
                      min={0}
                      max={100}
                      step={10}
                      defaultValue={percent}
                      disabled={locked}
                      className="flex-1 accent-primary"
                    />
                  </div>
                </Field>
              )}
              <Field label="学习笔记 / 遇到的问题" htmlFor="note">
                <Textarea id="note" name="note" defaultValue={progress?.note ?? ""} disabled={locked} maxLength={2000} placeholder="记录心得、难点，辅导员审核时可以看到" />
              </Field>
              <Field label="作品 / 代码链接" htmlFor="link" hint="如 GitHub 仓库、在线演示地址">
                <Input id="link" name="link" type="url" defaultValue={progress?.link ?? ""} disabled={locked} placeholder="https://" />
              </Field>
              {locked && progress?.link && (
                <a href={progress.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <ExternalLink className="size-3.5" /> 打开链接
                </a>
              )}
              {(!locked || files.length > 0) && (
                <Field label="作品文件 / 截图" hint={locked ? undefined : "支持图片和 .7z / .tar 压缩包，单个不超过 20 MB；图片会直接显示在界面中"}>
                  <FileUploader files={files} scope="progress" taskId={task.id} disabled={locked} onUploaded={addFile} onRemoved={removeFile} />
                </Field>
              )}

              {status === "approved" ? (
                <p className="flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-sm font-medium text-primary">
                  <CheckCircle2 className="size-4" /> 任务已完成
                </p>
              ) : status === "submitted" ? (
                <div className="flex flex-col gap-2">
                  <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">已提交，等待辅导员审核</p>
                  <Button variant="outline" onClick={() => action("withdraw")} loading={busy === "withdraw"}>
                    <Undo2 /> 撤回修改
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button type="submit" variant="outline" loading={busy === "save"}>
                    保存记录
                  </Button>
                  <Button onClick={() => action("submit")} loading={busy === "submit"} disabled={!allDone}>
                    <Send /> {task.require_review ? "提交审核" : "标记完成"}
                  </Button>
                  {!allDone && <p className="text-center text-xs text-muted-foreground">完成全部 {steps.length} 个步骤后可提交</p>}
                </div>
              )}
            </form>
          </Card>
          {events.length > 0 && (
            <Card>
              <CardHeader title="提交与审核记录" description={`共 ${events.length} 条`} />
              <ProgressTimeline events={events} className="max-h-96 overflow-y-auto p-5" />
            </Card>
          )}
        </aside>
      </div>

      <LogDialog open={logOpen} onClose={() => setLogOpen(false)} tasks={[{ id: task.id, title: task.title }]} defaultTaskId={task.id} />
    </div>
  );
}
