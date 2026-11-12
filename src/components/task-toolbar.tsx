import { LayoutGrid, List, Search, X } from "lucide-react";
import type { TaskFilters } from "@/hooks/use-task-list";
import { DUE_BUCKETS, GROUP_OPTIONS, SORT_OPTIONS, type DueBucket, type GroupBy, type SortBy, type ViewMode } from "@/lib/task-view";
import { cn } from "@/lib/utils";
import { Button, Card, Input, Select } from "./ui";

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  const modes = [
    { key: "grid" as const, label: "卡片视图", icon: LayoutGrid },
    { key: "list" as const, label: "列表视图", icon: List },
  ];
  return (
    <div className="flex shrink-0 gap-0.5 rounded-lg border bg-card p-0.5" role="group" aria-label="显示方式">
      {modes.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          title={label}
          onClick={() => onChange(key)}
          className={cn("flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground", value === key && "bg-muted text-foreground")}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

interface ToolbarProps {
  filters: TaskFilters;
  onChange: (patch: Partial<TaskFilters>) => void;
  techs: { tag: string; count: number }[];
  dueCounts: Record<DueBucket, number>;
  placeholder: string;
}

export function TaskToolbar({ filters, onChange, techs, dueCounts, placeholder }: ToolbarProps) {
  const active = !!(filters.q || filters.tech || filters.due);

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder={placeholder}
            className="pl-9"
            aria-label="搜索任务"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex">
          <Select value={filters.due} onChange={(e) => onChange({ due: e.target.value as DueBucket | "" })} aria-label="按截止日期筛选" className="lg:w-36">
            <option value="">全部日期</option>
            {DUE_BUCKETS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}（{dueCounts[b.key]}）
              </option>
            ))}
          </Select>
          <Select value={filters.group} onChange={(e) => onChange({ group: e.target.value as GroupBy })} aria-label="分组方式" className="lg:w-32">
            {GROUP_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortBy })} aria-label="排序方式" className="lg:w-32">
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {(techs.length > 0 || active) && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">学习技术</span>
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="按学习技术筛选">
            {techs.map(({ tag, count }) => {
              const selected = filters.tech === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange({ tech: selected ? "" : tag })}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs transition-colors",
                    selected ? "border-primary bg-primary-soft text-primary" : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {tag}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
            {filters.tech && !techs.some((t) => t.tag === filters.tech) && (
              <button type="button" aria-pressed onClick={() => onChange({ tech: "" })} className="flex shrink-0 items-center gap-1 rounded-md border border-primary bg-primary-soft px-2 py-1 font-mono text-xs text-primary">
                {filters.tech} <span className="opacity-70">0</span>
              </button>
            )}
          </div>
          {active && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ q: "", tech: "", due: "" })} className="shrink-0 text-muted-foreground">
              <X /> 清除筛选
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
