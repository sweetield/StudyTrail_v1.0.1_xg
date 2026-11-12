import { useMemo, useState } from "react";
import { Link } from "react-router";
import useSWR from "swr";
import { Download, ListTodo, Plus, SearchX } from "lucide-react";
import type { AdminTask } from "@/lib/types";
import { TASK_STATUS_LABEL } from "@/lib/status";
import { useFilteredTasks, useQueryParam, useTaskFilters, useViewMode } from "@/hooks/use-task-list";
import { Button, buttonVariants, Card, EmptyState, PageHeader, PageLoader, SegmentedTabs } from "@/components/ui";
import { AdminTaskCard, AdminTaskListHeader, AdminTaskRow } from "@/components/admin-task-item";
import { TaskGroups } from "@/components/task-groups";
import { TaskToolbar, ViewToggle } from "@/components/task-toolbar";
import { ExportDialog } from "@/components/export-dialog";

const TABS = (["published", "draft", "archived"] as const).map((key) => ({ key, label: TASK_STATUS_LABEL[key] }));

const NO_TASKS: AdminTask[] = [];
const searchFields = (t: AdminTask) => [t.title, t.tech_tags, t.class_name, t.class_names];

export default function AdminTasks() {
  const { data } = useSWR<{ tasks: AdminTask[] }>("/api/admin/tasks");
  const [tab, setTab] = useQueryParam<AdminTask["status"]>("status", TABS, "published");
  const [filters, setFilters] = useTaskFilters();
  const [view, setView] = useViewMode("admin-tasks", "list");
  const [exportOpen, setExportOpen] = useState(false);

  const all = data?.tasks ?? NO_TASKS;
  const inTab = useMemo(() => all.filter((t) => t.status === tab), [all, tab]);
  const { groups, techs, dueCounts, total } = useFilteredTasks(inTab, filters, searchFields);

  if (!data) return <PageLoader />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="学习任务"
        description="发布任务、拆分学习步骤，学员勾选后自动计算进度"
        action={
          <>
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download /> 导出进度
            </Button>
            <Link to="/admin/tasks/new" className={buttonVariants()}>
              <Plus /> 发布任务
            </Link>
          </>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <SegmentedTabs label="任务状态" options={TABS.map((t) => ({ ...t, count: all.filter((x) => x.status === t.key).length }))} value={tab} onChange={setTab} />
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline" aria-live="polite">
            共 {total} 个任务
          </span>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {inTab.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListTodo />}
            title={`暂无${TASK_STATUS_LABEL[tab]}任务`}
            action={
              tab === "published" ? (
                <Link to="/admin/tasks/new" className="text-sm text-primary hover:underline">
                  立即发布
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <TaskToolbar filters={filters} onChange={setFilters} techs={techs} dueCounts={dueCounts} placeholder="搜索任务名称、技术或班级" />
          {total === 0 ? (
            <Card>
              <EmptyState icon={<SearchX />} title="没有符合条件的任务" description="试试调整关键词、学习技术或日期条件" />
            </Card>
          ) : (
            <TaskGroups
              groups={groups}
              view={view}
              getKey={(t) => t.id}
              renderCard={(t) => <AdminTaskCard task={t} />}
              renderRow={(t) => <AdminTaskRow task={t} />}
              listHeader={<AdminTaskListHeader />}
            />
          )}
        </>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} tasks={all} mode="admin" />
    </div>
  );
}
