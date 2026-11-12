import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { countDueBuckets, countTechs, DUE_BUCKETS, dueBucket, GROUP_OPTIONS, groupTasks, SORT_OPTIONS, sortTasks, type DueBucket, type GroupBy, type SortBy, type TaskLike, type ViewMode } from "@/lib/task-view";
import { splitTags } from "@/lib/utils";

export interface TaskFilters {
  q: string;
  tech: string;
  due: DueBucket | "";
  group: GroupBy;
  sort: SortBy;
}

const DEFAULTS: TaskFilters = { q: "", tech: "", due: "", group: "none", sort: "priority" };

function oneOf<T extends string>(value: string | null, allowed: readonly { key: T }[], fallback: T): T {
  return allowed.some((o) => o.key === value) ? (value as T) : fallback;
}

export function useQueryParam<T extends string>(key: string, allowed: readonly { key: T }[], fallback: T) {
  const [params, setParams] = useSearchParams();
  const value = oneOf(params.get(key), allowed, fallback);
  const set = useCallback(
    (next: T) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === fallback) p.delete(key);
          else p.set(key, next);
          return p;
        },
        { replace: true },
      ),
    [key, fallback, setParams],
  );
  return [value, set] as const;
}

export function useTaskFilters() {
  const [params, setParams] = useSearchParams();
  const filters: TaskFilters = {
    q: params.get("q") ?? "",
    tech: params.get("tech") ?? "",
    due: oneOf<DueBucket | "">(params.get("due"), DUE_BUCKETS, ""),
    group: oneOf(params.get("group"), GROUP_OPTIONS, DEFAULTS.group),
    sort: oneOf(params.get("sort"), SORT_OPTIONS, DEFAULTS.sort),
  };
  const update = useCallback(
    (patch: Partial<TaskFilters>) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (!v || v === DEFAULTS[k as keyof TaskFilters]) p.delete(k);
            else p.set(k, v);
          }
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [filters, update] as const;
}

export function useViewMode(listKey: string, initial: ViewMode = "grid") {
  const storageKey = `xueji:view:${listKey}`;
  const [mode, setMode] = useState<ViewMode>(() => {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem(storageKey);
    return saved === "grid" || saved === "list" ? saved : initial;
  });
  const update = useCallback(
    (next: ViewMode) => {
      setMode(next);
      window.localStorage.setItem(storageKey, next);
    },
    [storageKey],
  );
  return [mode, update] as const;
}

export function useFilteredTasks<T extends TaskLike>(tasks: T[], filters: TaskFilters, searchFields: (t: T) => (string | null | undefined)[]) {
  const q = useDeferredValue(filters.q.trim().toLowerCase());
  return useMemo(() => {
    const searched = q ? tasks.filter((t) => searchFields(t).some((f) => f?.toLowerCase().includes(q))) : tasks;
    const byTech = filters.tech ? searched.filter((t) => splitTags(t.tech_tags).includes(filters.tech)) : searched;
    const byDue = filters.due ? searched.filter((t) => dueBucket(t.due_date) === filters.due) : searched;
    const result = filters.due ? byTech.filter((t) => dueBucket(t.due_date) === filters.due) : byTech;
    return {
      techs: countTechs(byDue),
      dueCounts: countDueBuckets(byTech),
      total: result.length,
      groups: groupTasks(sortTasks(result, filters.sort), filters.group),
    };
    // searchFields is a stable accessor per page; including it would recompute on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, q, filters.tech, filters.due, filters.sort, filters.group]);
}
