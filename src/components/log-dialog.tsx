import { useState, type FormEvent } from "react";
import { mutate } from "swr";
import { api } from "@/lib/api";
import { todayStr } from "@/lib/utils";
import type { FileMeta, StudyLog } from "@/lib/types";
import { useToast } from "./toast";
import { FileChips, FileUploader } from "./attachments";
import { Button, Dialog, Field, Input, Select, Textarea } from "./ui";

const QUICK_MINUTES = [30, 60, 90, 120];

export function LogDialog({
  open,
  onClose,
  tasks,
  defaultTaskId,
  editing,
  admin,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tasks: { id: number; title: string }[];
  defaultTaskId?: number;
  editing?: StudyLog | null;
  /** 管理员编辑学员日志：只允许修改内容与删除附件，不代学员上传新附件 */
  admin?: boolean;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [minutes, setMinutes] = useState(editing?.minutes ?? 60);
  const [files, setFiles] = useState<FileMeta[]>(editing?.files ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function close() {
    setFiles([]);
    onClose();
  }

  async function removeExisting(id: string) {
    if (!confirm("确定删除这个附件吗？删除后无法恢复。")) return;
    try {
      await api.del(`/api/files/${id}`);
      setFiles((prev) => prev.filter((file) => file.id !== id));
      toast("附件已删除");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError("");
    try {
      const taskId = form.get("task_id");
      const payload = {
        content: form.get("content"),
        minutes,
        log_date: form.get("log_date"),
        task_id: taskId ? Number(taskId) : null,
        file_ids: files.map((file) => file.id),
      };
      if (admin && editing) await api.patch(`/api/admin/logs/${editing.id}`, payload);
      else if (editing) await api.patch(`/api/me/logs/${editing.id}`, payload);
      else await api.post("/api/me/logs", payload);
      await mutate((key) => typeof key === "string" && key.startsWith(admin ? "/api/admin/" : "/api/me/"));
      toast(editing ? "日志已更新" : "学习打卡成功");
      setFiles([]);
      onSaved?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={editing ? "编辑日志" : "学习打卡"}
      description={editing ? "修改后会同步更新学习统计" : "记录今天学了什么，坚持就是进步"}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期" htmlFor="log_date">
            <Input id="log_date" name="log_date" type="date" defaultValue={editing?.log_date ?? todayStr()} max={todayStr()} required />
          </Field>
          <Field label="关联任务" htmlFor="task_id">
            <Select id="task_id" name="task_id" defaultValue={editing ? (editing.task_id ?? "") : (defaultTaskId ?? "")}>
              <option value="">不关联</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="学习时长" htmlFor="minutes">
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={`h-9 rounded-lg border px-3 text-sm transition-colors ${minutes === m ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted"}`}
              >
                {m < 60 ? `${m} 分钟` : `${m / 60} 小时`}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                id="minutes"
                type="number"
                min={0}
                max={1440}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="h-9 w-20"
                aria-label="自定义分钟数"
              />
              <span className="text-sm text-muted-foreground">分钟</span>
            </div>
          </div>
        </Field>
        <Field label="学习内容" htmlFor="content">
          <Textarea id="content" name="content" defaultValue={editing?.content} required maxLength={2000} placeholder="例如：完成了 useEffect 的练习，理解了依赖数组的作用" />
        </Field>
        <Field label="图片 / 附件">
          {admin ? (
            files.length ? (
              <FileChips files={files} onRemove={removeExisting} />
            ) : (
              <p className="text-xs text-muted-foreground">该日志没有附件。管理员可以删除不合规附件，如需新增请让学员重新上传。</p>
            )
          ) : (
            <FileUploader
              files={files}
              scope="log"
              onUploaded={(file) => setFiles((prev) => [...prev, file])}
              onRemoved={(id) => setFiles((prev) => prev.filter((file) => file.id !== id))}
            />
          )}
        </Field>
        {error && (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            取消
          </Button>
          <Button type="submit" loading={loading}>
            {editing ? "保存修改" : "提交打卡"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
