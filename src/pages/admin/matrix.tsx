import { useState } from "react";
import { Link } from "react-router";
import useSWR from "swr";
import { Download, Grid3x3 } from "lucide-react";
import type { ClassItem, ProgressStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState, PageHeader, PageLoader, Select } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";

interface MatrixData {
  students: { id: number; name: string; class_id: number | null }[];
  tasks: { id: number; title: string; class_id: number | null; class_ids: number[]; excluded_user_ids: number[] }[];
  cells: { task_id: number; user_id: number; status: ProgressStatus; percent: number }[];
}

const CELL_STYLE: Record<ProgressStatus | "todo", string> = {
  todo: "bg-muted text-muted-foreground/60",
  doing: "bg-primary-soft text-primary",
  submitted: "bg-warning-soft text-warning",
  approved: "bg-primary text-primary-foreground",
  rejected: "bg-destructive-soft text-destructive",
};

export default function AdminMatrix() {
  const [classId, setClassId] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const { data: classData } = useSWR<{ classes: ClassItem[] }>("/api/admin/classes");
  const { data } = useSWR<MatrixData>(`/api/admin/matrix${classId ? `?class_id=${classId}` : ""}`, { keepPreviousData: true });

  const cellMap = new Map((data?.cells ?? []).map((c) => [`${c.user_id}:${c.task_id}`, c]));
  const eligible = (s: MatrixData["students"][number], t: MatrixData["tasks"][number]) =>
    (!t.class_ids.length || (s.class_id != null && t.class_ids.includes(s.class_id))) && !t.excluded_user_ids.includes(s.id);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="进度矩阵"
        description="一屏查看每位学员在每个任务上的状态"
        action={
          <>
            <Button variant="outline" onClick={() => setExportOpen(true)} disabled={!data?.tasks.length}>
              <Download /> 导出进度
            </Button>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-48" aria-label="选择班级">
              <option value="">全部班级</option>
              {classData?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </>
        }
      />

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(CELL_STYLE) as (keyof typeof CELL_STYLE)[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm", CELL_STYLE[k])} aria-hidden="true" />
            {k === "todo" ? "未开始" : statusMeta(k).label}
          </span>
        ))}
      </div>

      {!data ? (
        <PageLoader />
      ) : !data.students.length || !data.tasks.length ? (
        <Card>
          <EmptyState icon={<Grid3x3 />} title="暂无数据" description="需要至少一名学员和一个已发布任务" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 min-w-32 border-r border-b bg-card px-4 py-3 text-left text-xs font-medium text-muted-foreground">学员 / 任务</th>
                  {data.tasks.map((t) => (
                    <th key={t.id} className="sticky top-0 z-10 border-b bg-card px-1 py-3 align-bottom">
                      <Link to={`/admin/tasks/${t.id}`} title={t.title} className="mx-auto block w-20 truncate text-xs font-medium hover:text-primary">
                        {t.title}
                      </Link>
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 border-b border-l bg-card px-3 py-3 text-xs font-medium text-muted-foreground">完成</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => {
                  const mine = data.tasks.filter((t) => eligible(s, t));
                  const done = mine.filter((t) => cellMap.get(`${s.id}:${t.id}`)?.status === "approved").length;
                  return (
                    <tr key={s.id} className="group">
                      <th className="sticky left-0 z-10 border-r border-b bg-card px-4 py-1.5 text-left font-medium group-hover:bg-muted">
                        <Link to={`/admin/students/${s.id}`} className="block max-w-32 truncate hover:text-primary">
                          {s.name}
                        </Link>
                      </th>
                      {data.tasks.map((t) => {
                        if (!eligible(s, t)) return <td key={t.id} className="border-b px-1 py-1.5" aria-label="不适用" />;
                        const cell = cellMap.get(`${s.id}:${t.id}`);
                        const status = cell?.status ?? "todo";
                        return (
                          <td key={t.id} className="border-b px-1 py-1.5 text-center">
                            <span
                              className={cn("mx-auto flex h-7 w-20 items-center justify-center rounded-md text-xs font-medium tabular-nums", CELL_STYLE[status])}
                              title={`${s.name} · ${t.title} · ${status === "todo" ? "未开始" : statusMeta(status).label}`}
                            >
                              {status === "approved" ? "完成" : status === "todo" ? "—" : status === "submitted" ? "待审" : `${cell!.percent}%`}
                            </span>
                          </td>
                        );
                      })}
                      <td className="border-b border-l px-3 py-1.5 text-center text-xs tabular-nums text-muted-foreground">
                        {done}/{mine.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tasks={data?.tasks ?? []}
        mode="admin"
        classId={classId ? Number(classId) : null}
      />
    </div>
  );
}
