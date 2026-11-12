import { Link } from "react-router";
import { CalendarClock, ChevronRight, Users } from "lucide-react";
import type { AdminTask } from "@/lib/types";
import { cn, dueInfo, splitTags } from "@/lib/utils";
import { PriorityBadge } from "./priority-badge";
import { StackedBar } from "./stacked-bar";
import { Badge, TechTag } from "./ui";

function todoCount(t: AdminTask) {
  return Math.max(0, t.assigned - t.approved - t.submitted - t.doing);
}

function audienceLabel(t: AdminTask) {
  return t.class_names ?? t.class_name ?? "全部学员";
}

function DueText({ due }: { due: string | null }) {
  const info = dueInfo(due);
  if (!info) return <span className="text-muted-foreground">不限期</span>;
  return <span className={cn(info.tone === "destructive" ? "text-destructive" : info.tone === "warning" ? "text-warning" : "text-muted-foreground")}>{due}</span>;
}

function Completion({ task }: { task: AdminTask }) {
  return (
    <div className="flex flex-col gap-1.5">
      <StackedBar approved={task.approved} submitted={task.submitted} doing={task.doing} todo={todoCount(task)} />
      <span className="text-xs tabular-nums text-muted-foreground">
        {task.approved}/{task.assigned} 已完成 · {task.doing} 学习中
      </span>
    </div>
  );
}

export function AdminTaskCard({ task }: { task: AdminTask }) {
  const tags = splitTags(task.tech_tags);
  return (
    <Link to={`/admin/tasks/${task.id}`} className="group flex w-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 font-medium leading-snug text-pretty group-hover:text-primary">{task.title}</h3>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {task.submitted > 0 && <Badge tone="warning">{task.submitted} 待审</Badge>}
          <PriorityBadge priority={task.priority} />
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 5).map((tag) => (
            <TechTag key={tag}>{tag}</TechTag>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="size-3.5" aria-hidden="true" />
          {audienceLabel(task)}
        </span>
        <span className="flex items-center gap-1">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          <DueText due={task.due_date} />
        </span>
        <span>{task.step_count ? `${task.step_count} 个步骤` : "手动进度"}</span>
      </div>
      <div className="mt-auto">
        <Completion task={task} />
      </div>
    </Link>
  );
}

export function AdminTaskRow({ task }: { task: AdminTask }) {
  const tags = splitTags(task.tech_tags);
  return (
    <Link to={`/admin/tasks/${task.id}`} className="group flex flex-col gap-3 px-5 py-3.5 hover:bg-muted/40 @lg:flex-row @lg:items-center @lg:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium group-hover:text-primary">{task.title}</span>
          <PriorityBadge priority={task.priority} />
          {task.submitted > 0 && <Badge tone="warning">{task.submitted} 待审</Badge>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {tags.slice(0, 4).map((tag) => (
            <TechTag key={tag}>{tag}</TechTag>
          ))}
          <span className="text-xs text-muted-foreground">{task.step_count ? `${task.step_count} 个步骤` : "手动进度"}</span>
        </div>
      </div>
      <div className="hidden w-24 shrink-0 truncate text-sm text-muted-foreground @3xl:block">{audienceLabel(task)}</div>
      <div className="w-24 shrink-0 text-sm whitespace-nowrap tabular-nums">
        <DueText due={task.due_date} />
      </div>
      <div className="flex shrink-0 items-center gap-3 @lg:w-44">
        <div className="flex-1">
          <Completion task={task} />
        </div>
        <ChevronRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 @lg:block" aria-hidden="true" />
      </div>
    </Link>
  );
}

export function AdminTaskListHeader() {
  return (
    <div className="hidden gap-4 border-b bg-muted/50 px-5 py-2.5 text-xs font-medium text-muted-foreground @lg:flex">
      <span className="flex-1">任务</span>
      <span className="hidden w-24 @3xl:block">发布范围</span>
      <span className="w-24">截止日期</span>
      <span className="w-44">完成情况</span>
    </div>
  );
}
