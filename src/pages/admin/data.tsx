import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { mutate } from "swr";
import { AlertTriangle, Download, FileJson, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Dialog, Field, Input, PageHeader } from "@/components/ui";

const TABLE_LABELS: Record<string, string> = {
  classes: "班级",
  users: "账号",
  tasks: "学习任务",
  task_steps: "任务步骤",
  progress: "学习进度",
  step_checks: "步骤打卡",
  study_logs: "学习日志",
};

interface BackupFile {
  format: string;
  version: number;
  exported_at: string;
  tables: Record<string, unknown[]>;
}

interface PendingRestore {
  fileName: string;
  backup: BackupFile;
}

function parseBackup(text: string): BackupFile {
  const data = JSON.parse(text) as Partial<BackupFile>;
  if (data.format !== "xueji-backup" || !data.tables || typeof data.tables !== "object") {
    throw new Error("不是有效的学迹备份文件");
  }
  return data as BackupFile;
}

function TableCounts({ tables }: { tables: Record<string, unknown[]> }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Object.entries(TABLE_LABELS).map(([key, label]) => (
        <div key={key} className="rounded-lg bg-muted px-3 py-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{Array.isArray(tables[key]) ? tables[key].length : 0}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminDataPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/data/export", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`导出失败 (${res.status})`);
      const blob = await res.blob();
      const name = res.headers.get("content-disposition")?.match(/filename="(.+?)"/)?.[1] ?? "xueji-backup.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      toast("备份文件已下载");
    } catch (err) {
      toast(err instanceof Error ? err.message : "导出失败", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      setPassword("");
      setConfirmText("");
      setPending({ fileName: file.name, backup });
    } catch (err) {
      toast(err instanceof SyntaxError ? "文件不是有效的 JSON" : err instanceof Error ? err.message : "读取文件失败", "error");
    }
  }

  async function handleRestore(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setRestoring(true);
    try {
      await api.post("/api/admin/data/import", { password, backup: pending.backup });
      setPending(null);
      await mutate(() => true, undefined, { revalidate: false });
      await mutate("/api/auth/me", { user: null }, { revalidate: false });
      toast("数据已恢复，请使用备份中的账号重新登录");
      navigate("/login", { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : "恢复失败", "error");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="数据备份" description="导出全部数据作为备份文件，或从备份文件恢复。" />

      <Card>
        <CardHeader
          title="导出备份"
          description="包含班级、账号、任务、进度、打卡与学习日志，不包含登录会话、附件文件内容与头像图片。"
          action={
            <Button onClick={handleExport} loading={exporting}>
              <Download aria-hidden="true" />
              导出备份
            </Button>
          }
        />
        <p className="px-5 py-4 text-sm text-muted-foreground">
          备份文件中含有账号的密码哈希（不是明文密码），请妥善保管，不要公开分享。建议定期导出并保存到安全的位置。
        </p>
      </Card>

      <Card>
        <CardHeader
          title="从备份恢复"
          description="选择之前导出的 .json 备份文件，确认后会用备份内容覆盖当前全部数据。"
          action={
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden="true" />
              选择备份文件
            </Button>
          }
        />
        <div className="flex items-start gap-3 px-5 py-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-muted-foreground">
            恢复会清空当前数据并替换为备份内容，所有用户都需要重新登录。恢复前建议先导出一份当前数据。恢复在单个事务中完成，失败时原有数据保持不变。
          </p>
        </div>
        <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" onChange={handleFile} aria-label="选择备份文件" tabIndex={-1} />
      </Card>

      <Dialog open={!!pending} onClose={() => !restoring && setPending(null)} title="确认恢复数据" description="当前全部数据将被备份内容覆盖，此操作无法撤销。">
        {pending && (
          <form onSubmit={handleRestore} className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm">
              <FileJson className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="truncate font-medium">{pending.fileName}</span>
              <span className="shrink-0 text-muted-foreground">
                {Number.isNaN(Date.parse(pending.backup.exported_at)) ? "" : `导出于 ${new Date(pending.backup.exported_at).toLocaleString("zh-CN")}`}
              </span>
            </div>
            <TableCounts tables={pending.backup.tables} />
            <Field label="当前管理员密码" htmlFor="restore-password">
              <Input id="restore-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Field label="请输入「确认恢复」以继续" htmlFor="restore-confirm">
              <Input id="restore-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" required />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPending(null)} disabled={restoring}>
                取消
              </Button>
              <Button type="submit" variant="destructive" loading={restoring} disabled={!password || confirmText.trim() !== "确认恢复"}>
                覆盖并恢复
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
