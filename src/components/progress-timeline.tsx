import { CheckCircle2, Send, Star, Undo2, XCircle } from "lucide-react";
import type { ProgressEvent } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

const META: Record<ProgressEvent["action"], { label: string; icon: typeof Send; tone: string }> = {
  submit: { label: "提交审核", icon: Send, tone: "bg-primary-soft text-primary" },
  withdraw: { label: "撤回提交", icon: Undo2, tone: "bg-muted text-muted-foreground" },
  approve: { label: "审核通过", icon: CheckCircle2, tone: "bg-primary text-primary-foreground" },
  reject: { label: "退回修改", icon: XCircle, tone: "bg-destructive-soft text-destructive" },
};

export function ProgressTimeline({ events, className }: { events: ProgressEvent[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {events.map((e, i) => {
        const meta = META[e.action];
        const Icon = meta.icon;
        // 无需审核的任务由学员直接完成，没有前置的提交记录
        const autoApproved = e.action === "approve" && events[i + 1]?.action !== "submit";
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < events.length - 1 && <span className="absolute top-7 bottom-0 left-3.5 w-px bg-border" aria-hidden="true" />}
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", meta.tone)}>
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className="font-medium">{autoApproved ? "自动完成" : meta.label}</span>
                {e.actor_name && !autoApproved && <span className="text-muted-foreground">{e.actor_name}</span>}
                {e.score !== null && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-warning" aria-label={`评分 ${e.score} 星`}>
                    <Star className="size-3 fill-current" aria-hidden="true" />
                    {e.score}
                  </span>
                )}
                <time className="ml-auto text-xs text-muted-foreground tabular-nums">{formatTime(e.created_at)}</time>
              </div>
              {e.comment && <p className="mt-1 rounded-md bg-muted/60 px-2.5 py-1.5 text-sm leading-relaxed whitespace-pre-wrap">{e.comment}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
