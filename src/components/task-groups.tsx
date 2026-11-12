import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { TaskGroup, ViewMode } from "@/lib/task-view";
import { cn } from "@/lib/utils";
import { Button, Card } from "./ui";

const PAGE_SIZE = { grouped: { grid: 6, list: 8 }, flat: { grid: 24, list: 30 } };

interface Props<T> {
  groups: TaskGroup<T>[];
  view: ViewMode;
  renderCard: (item: T) => ReactNode;
  renderRow: (item: T) => ReactNode;
  listHeader?: ReactNode;
  getKey: (item: T) => number;
}

export function TaskGroups<T>({ groups, view, renderCard, renderRow, listHeader, getKey }: Props<T>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [limits, setLimits] = useState<Record<string, number>>({});
  const grouped = groups.length > 0 && groups[0].kind !== "none";
  const pageSize = PAGE_SIZE[grouped ? "grouped" : "flat"][view];

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="@container flex flex-col gap-6">
      {grouped && groups.length > 1 && (
        <div className="-mb-3 flex justify-end gap-3 text-xs">
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(new Set())}>
            全部展开
          </button>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(new Set(groups.map((g) => g.key)))}>
            全部收起
          </button>
        </div>
      )}
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        const limit = limits[group.key] ?? pageSize;
        const visible = group.items.slice(0, limit);
        const rest = group.items.length - visible.length;
        const panelId = `group-${group.kind}-${group.key}`;

        return (
          <section key={group.key} aria-label={grouped ? group.label : undefined} className="flex flex-col gap-3">
            {grouped && (
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={!isCollapsed}
                aria-controls={panelId}
                className="group flex items-center gap-2 self-start rounded-md text-sm font-medium"
              >
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} aria-hidden="true" />
                <span className={cn(group.kind === "tech" && group.key !== "__untagged" && "font-mono")}>{group.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{group.items.length}</span>
              </button>
            )}
            {!isCollapsed && (
              <div id={panelId} className="flex flex-col gap-3">
                {view === "grid" ? (
                  <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
                    {visible.map((item) => (
                      <div key={getKey(item)} className="flex">
                        {renderCard(item)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Card className="overflow-hidden">
                    {listHeader}
                    <ul className="divide-y">
                      {visible.map((item) => (
                        <li key={getKey(item)}>{renderRow(item)}</li>
                      ))}
                    </ul>
                  </Card>
                )}
                {rest > 0 && (
                  <Button variant="outline" size="sm" className="self-center" onClick={() => setLimits((prev) => ({ ...prev, [group.key]: limit + pageSize * 2 }))}>
                    显示更多（还有 {rest} 项）
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
