import { useMemo, useState } from "react";
import useSWR from "swr";
import { Download, ListChecks, SearchX } from "lucide-react";
import type { StudentTask } from "@/lib/types";
import { useFilteredTasks, useQueryParam, useTaskFilters, useViewMode } from "@/hooks/use-task-list";
import { Button, Card, EmptyState, PageHeader, PageLoader, SegmentedTabs } from "@/components/ui";
import { StudentTaskCard, StudentTaskListHeader, StudentTaskRow } from "@/components/student-task-card";
import { TaskGroups } from "@/components/task-groups";
import { TaskToolbar, ViewToggle } from "@/components/task-toolbar";
import { ExportDialog } from "@/components/export-dialog";

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "todo", label: "未开始" },
  { key: "doing", label: "进行中" },
  { key: "submitted", label: "待审核" },
  { key: "approved", label: "已完成" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matches(t: StudentTask, f: FilterKey) {
  if (f === "all") return true;
  if (f === "todo") return !t.status;
  if (f === "doing") return t.status === "doing" || t.status === "rejected";
  return t.status === f;
}

const NO_TASKS: StudentTask[] = [];
const searchFields = (t: StudentTask) => [t.title, t.tech_tags];

export default function StudentTasks() {
  const { data } = useSWR<{ tasks: StudentTask[] }>("/api/me/tasks");
  const [status, setStatus] = useQueryParam<FilterKey>("status", FILTERS, "all");
  const [filters, setFilters] = useTaskFilters();
  const [view, setView] = useViewMode("student-tasks", "grid");
  const [exportOpen, setExportOpen] = useState(false);

  const all = data?.tasks ?? NO_TASKS;
  const inTab = useMemo(() => all.filter((t) => matches(t, status)), [all, status]);
  const { groups, techs, dueCounts, total } = useFilteredTasks(inTab, filters, searchFields);

  if (!data) return <PageLoader />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="我的任务"
        description="点击任务进入详情，勾选步骤即可自动更新进度"
        action={
          <Button variant="outline" onClick={() => setExportOpen(true)} disabled={!all.length}>
            <Download /> 导出进度
          </Button>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <SegmentedTabs label="任务状态筛选" options={FILTERS.map((f) => ({ ...f, count: all.filter((t) => matches(t, f.key)).length }))} value={status} onChange={setStatus} />
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline" aria-live="polite">
            共 {total} 个任务
          </span>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {all.length === 0 ? (
        <Card>
          <EmptyState icon={<ListChecks />} title="暂无学习任务" description="辅导员发布任务后会显示在这里" />
        </Card>
      ) : (
        <>
          <TaskToolbar filters={filters} onChange={setFilters} techs={techs} dueCounts={dueCounts} placeholder="搜索任务名称或技术" />
          {total === 0 ? (
            <Card>
              <EmptyState icon={<SearchX />} title="没有符合条件的任务" description="试试切换状态，或调整关键词、学习技术、日期条件" />
            </Card>
          ) : (
            <TaskGroups
              groups={groups}
              view={view}
              getKey={(t) => t.id}
              renderCard={(t) => <StudentTaskCard task={t} />}
              renderRow={(t) => <StudentTaskRow task={t} />}
              listHeader={<StudentTaskListHeader />}
            />
          )}
        </>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} tasks={all} mode="student" />
    </div>
  );
}
