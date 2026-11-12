import { useState } from "react";
import { Link } from "react-router";
import useSWR from "swr";
import { CheckCheck, ClipboardCheck, ExternalLink } from "lucide-react";
import type { ProgressStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";
import { cn, formatTime } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, PageHeader, PageLoader, SegmentedTabs } from "@/components/ui";
import { ReviewDialog, submitReview, type ReviewTarget } from "@/components/review-dialog";
import { StarScore } from "@/components/star-rating";
import { Avatar } from "@/components/avatar";

interface ReviewRow extends ReviewTarget {
  status: ProgressStatus;
  username: string;
  class_name: string | null;
  avatar_id: string | null;
  review_comment: string;
  score: number | null;
  reviewed_at: number | null;
  reviewer_name: string | null;
  attempts: number;
}

const REVIEW_TABS = [
  { key: "pending", label: "待审核" },
  { key: "done", label: "已审核" },
] as const;

const rowKey = (r: { task_id: number; user_id: number }) => `${r.task_id}:${r.user_id}`;

export default function AdminReviews() {
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const { data } = useSWR<{ reviews: ReviewRow[] }>(`/api/admin/reviews?status=${tab}`, { keepPreviousData: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [batching, setBatching] = useState(false);
  const toast = useToast();

  const list = data?.reviews ?? [];
  const allSelected = list.length > 0 && list.every((r) => selected.has(rowKey(r)));

  function toggle(k: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function batchApprove() {
    const items = list.filter((r) => selected.has(rowKey(r))).map((r) => ({ task_id: r.task_id, user_id: r.user_id }));
    if (!items.length) return;
    setBatching(true);
    try {
      const n = await submitReview(items, "approve", "", null);
      toast(`已批量通过 ${n} 条提交`);
      setSelected(new Set());
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBatching(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="进度审核" description="学员提交任务后在这里审核，按提交时间先后排序" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          label="审核状态"
          options={REVIEW_TABS}
          value={tab}
          onChange={(k) => {
            setTab(k);
            setSelected(new Set());
          }}
        />
        {tab === "pending" && list.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(list.map(rowKey)))}
              />
              全选
            </label>
            <Button size="sm" onClick={batchApprove} disabled={!selected.size} loading={batching}>
              <CheckCheck /> 批量通过 {selected.size ? `(${selected.size})` : ""}
            </Button>
          </div>
        )}
      </div>

      {!data ? (
        <PageLoader />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardCheck />} title={tab === "pending" ? "没有待审核的提交" : "暂无审核记录"} description={tab === "pending" ? "学员提交任务后会出现在这里" : undefined} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => {
            const k = rowKey(r);
            const meta = statusMeta(r.status);
            return (
              <li key={k}>
                <Card className={cn("flex gap-4 p-4 transition-colors", selected.has(k) && "border-primary/50 bg-primary-soft/40")}>
                  {tab === "pending" && (
                    <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={selected.has(k)} onChange={() => toggle(k)} aria-label={`选择 ${r.user_name} 的提交`} />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link to={`/admin/students/${r.user_id}`} className="flex items-center gap-2 font-medium hover:text-primary">
                        <Avatar name={r.user_name} avatarId={r.avatar_id} className="size-7 text-xs" />
                        {r.user_name}
                      </Link>
                      {r.class_name && <span className="text-xs text-muted-foreground">{r.class_name}</span>}
                      <span className="text-muted-foreground">·</span>
                      <Link to={`/admin/tasks/${r.task_id}`} className="truncate text-sm text-muted-foreground hover:text-primary">
                        {r.task_title}
                      </Link>
                      {tab === "pending" && r.attempts > 1 && <Badge tone="warning">第 {r.attempts} 次提交</Badge>}
                      {tab === "done" && <Badge tone={meta.tone}>{meta.label}</Badge>}
                      {tab === "done" && <StarScore score={r.score} />}
                    </div>
                    {r.note && <p className="line-clamp-3 text-sm leading-relaxed whitespace-pre-wrap text-pretty">{r.note}</p>}
                    {r.link && (
                      <a href={r.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 self-start break-all text-sm text-primary hover:underline">
                        <ExternalLink className="size-3.5 shrink-0" />
                        {r.link}
                      </a>
                    )}
                    {tab === "done" && r.review_comment && <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">辅导员评语：{r.review_comment}</p>}
                    <p className="text-xs text-muted-foreground">
                      提交于 {formatTime(r.submitted_at)}
                      {tab === "done" && ` · ${r.reviewer_name ?? ""}审核于 ${formatTime(r.reviewed_at)}`}
                    </p>
                  </div>
                  {tab === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => setTarget(r)} className="shrink-0 self-start">
                      审核
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ReviewDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
