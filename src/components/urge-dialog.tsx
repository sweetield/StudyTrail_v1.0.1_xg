import { useEffect, useMemo, useState } from "react";
import { AlarmClock, CheckCheck, Send } from "lucide-react";
import { api } from "@/lib/api";
import type { ProgressStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Countdown } from "./countdown";
import { useToast } from "./toast";
import { Badge, Button, Dialog, Field, Input, Textarea } from "./ui";

export interface UrgeCandidate {
  user_id: number;
  name: string;
  class_name: string | null;
  status: ProgressStatus | null;
  urge_due_at?: number | null;
}

const MINUTE_PRESETS = [
  { value: 30, label: "30 分钟" },
  { value: 60, label: "1 小时" },
  { value: 180, label: "3 小时" },
  { value: 720, label: "12 小时" },
  { value: 1440, label: "1 天" },
];

export function UrgeDialog({
  open,
  onClose,
  taskId,
  taskTitle,
  roster,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  taskId: number;
  taskTitle: string;
  roster: UrgeCandidate[];
  onDone?: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setMinutes(60);
    setMessage("");
    setError("");
  }, [open]);

  const candidates = useMemo(
    () =>
      [...roster].sort((a, b) => {
        const rank = (status: ProgressStatus | null) => (status === "approved" ? 1 : 0);
        return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, "zh-CN");
      }),
    [roster],
  );
  const pending = candidates.filter((r) => r.status !== "approved");

  function toggle(userId: number) {
    setSelected((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function toggleAll() {
    const pendingIds = pending.map((r) => r.user_id);
    setSelected((prev) => (pendingIds.every((id) => prev.includes(id)) ? [] : pendingIds));
  }

  async function submit() {
    if (!selected.length) {
      setError("请选择要督促的学员");
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 43200) {
      setError("倒计时需在 1 到 43200 分钟之间");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ count: number }>(`/api/admin/tasks/${taskId}/urge`, {
        user_ids: selected,
        minutes,
        message: message.trim() || undefined,
      });
      toast(`已督促 ${res.count} 名学员`);
      onDone?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="督促学员"
      description={`为《${taskTitle}》设置倒计时，被督促的学员会看到醒目提醒和剩余时间`}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            选择学员 <span className="text-muted-foreground">（已选 {selected.length} 人）</span>
          </p>
          <Button variant="ghost" size="sm" onClick={toggleAll} disabled={!pending.length}>
            <CheckCheck /> 全选未完成
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-lg border">
          {candidates.length ? (
            <ul className="divide-y">
              {candidates.map((r) => {
                const meta = statusMeta(r.status);
                return (
                  <li key={r.user_id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={selected.includes(r.user_id)}
                        onChange={() => toggle(r.user_id)}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.class_name ?? "未分班"}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {r.urge_due_at && (
                          <span className="hidden items-center gap-1 text-xs text-destructive sm:flex">
                            <AlarmClock className="size-3.5" aria-hidden="true" />
                            <Countdown dueAt={r.urge_due_at} />
                          </span>
                        )}
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">该任务暂无可督促的学员</p>
          )}
        </div>

        <Field label="倒计时时长" htmlFor="urge-minutes" hint="学员端会显示剩余时间，到期后会标记为已超时">
          <div className="flex flex-wrap items-center gap-2">
            {MINUTE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setMinutes(preset.value)}
                className={cn(
                  "h-9 rounded-lg border px-3 text-sm transition-colors",
                  minutes === preset.value ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted",
                )}
              >
                {preset.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                id="urge-minutes"
                type="number"
                min={1}
                max={43200}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="h-9 w-24"
                aria-label="自定义倒计时分钟数"
              />
              <span className="text-sm text-muted-foreground">分钟</span>
            </div>
          </div>
        </Field>

        <Field label="督促说明（可选）" htmlFor="urge-message" hint="会显示在学员的任务提醒和通知中">
          <Textarea
            id="urge-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="例如：请在本周内完成并提交，有困难及时沟通"
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} loading={busy} disabled={!selected.length}>
            <Send /> 发送督促
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
