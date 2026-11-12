import { useState } from "react";
import useSWR, { mutate } from "swr";
import type { FileMeta, ProgressEvent } from "@/lib/types";
import { ProgressTimeline } from "./progress-timeline";
import { Check, ExternalLink, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { useToast } from "./toast";
import { StarRating } from "./star-rating";
import { FileChips } from "./attachments";
import { Button, Dialog, Field, Textarea } from "./ui";

export interface ReviewTarget {
  task_id: number;
  user_id: number;
  user_name: string;
  task_title: string;
  note: string | null;
  link: string | null;
  submitted_at: number | null;
}

type ReviewAction = "approve" | "reject";

export async function submitReview(items: { task_id: number; user_id: number }[], action: ReviewAction, comment: string, score: number | null) {
  const res = await api.post<{ updated: number }>("/api/admin/reviews", { items, action, comment, score: action === "approve" ? score : null });
  await mutate((key) => typeof key === "string" && key.startsWith("/api/admin/"));
  return res.updated;
}

export function ReviewDialog({ target, onClose }: { target: ReviewTarget | null; onClose: () => void }) {
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [busy, setBusy] = useState<ReviewAction | null>(null);
  const { data: eventData } = useSWR<{ events: ProgressEvent[] }>(
    target ? `/api/admin/progress/${target.task_id}/${target.user_id}/events` : null,
  );
  const { data: fileData, mutate: mutateFiles } = useSWR<{ files: FileMeta[] }>(
    target ? `/api/admin/progress/${target.task_id}/${target.user_id}/files` : null,
  );
  // 第一条是本次提交，其余为此前的提交与审核往来
  const history = eventData?.events.slice(1) ?? [];

  async function removeFile(id: string) {
    if (!confirm("确定删除这个作品附件吗？删除后无法恢复。")) return;
    try {
      await api.del(`/api/files/${id}`);
      await mutateFiles();
      await mutate((key) => typeof key === "string" && key.startsWith("/api/admin/"));
      toast("附件已删除");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  function close() {
    setComment("");
    setScore(null);
    onClose();
  }

  async function run(action: ReviewAction) {
    if (!target) return;
    setBusy(action);
    try {
      await submitReview([{ task_id: target.task_id, user_id: target.user_id }], action, comment, score);
      toast(action === "approve" ? `已通过 ${target.user_name} 的提交` : `已退回给 ${target.user_name}`);
      close();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={!!target} onClose={close} title={`审核：${target?.user_name ?? ""}`} description={target?.task_title}>
      {target && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <p className="mb-1 text-xs text-muted-foreground">学员笔记 · 提交于 {formatTime(target.submitted_at)}</p>
            <p className="leading-relaxed whitespace-pre-wrap">{target.note || "（未填写）"}</p>
            {target.link && (
              <a href={target.link} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 break-all text-primary hover:underline">
                <ExternalLink className="size-3.5 shrink-0" /> {target.link}
              </a>
            )}
          </div>
          {!!fileData?.files.length && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs text-muted-foreground">作品附件（{fileData.files.length}）· 可删除不合规文件</p>
              <FileChips files={fileData.files} onRemove={removeFile} />
            </div>
          )}
          {history.length > 0 && (
            <details className="group rounded-lg border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none">
                历史记录（{history.length} 条）
              </summary>
              <ProgressTimeline events={history} className="mt-3" />
            </details>
          )}
          <Field label="辅导员评分" hint="审核通过时生效，再次点击同一颗星可取消">
            <StarRating value={score} onChange={setScore} label="辅导员评分" />
          </Field>
          <Field label="辅导员评语 / 退回原因" htmlFor="review-comment" hint="退回时必填，学员会在任务页看到">
            <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="做得很好！/ 请补充 README 说明" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => run("reject")} loading={busy === "reject"} className="text-destructive">
              <Undo2 /> 退回修改
            </Button>
            <Button onClick={() => run("approve")} loading={busy === "approve"}>
              <Check /> 审核通过
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
