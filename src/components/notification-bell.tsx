import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useNavigate } from "react-router";
import { AlarmClock, Bell, CheckCheck, CheckCircle2, ClipboardCheck, ListTodo, MessageSquareText, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { AppNotification } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

interface NotificationData {
  items: AppNotification[];
  unread: number;
}

const ICONS: Record<AppNotification["kind"], { icon: typeof Bell; tone: string }> = {
  task: { icon: ListTodo, tone: "bg-primary-soft text-primary" },
  submit: { icon: ClipboardCheck, tone: "bg-warning-soft text-warning" },
  approve: { icon: CheckCircle2, tone: "bg-primary-soft text-primary" },
  reject: { icon: XCircle, tone: "bg-destructive-soft text-destructive" },
  reply: { icon: MessageSquareText, tone: "bg-primary-soft text-primary" },
  urge: { icon: AlarmClock, tone: "bg-destructive-soft text-destructive" },
};

const KEY = "/api/notifications";

export function NotificationBell({ align = "left" }: { align?: "left" | "right" }) {
  const { data, mutate } = useSWR<NotificationData>(KEY, { refreshInterval: 60_000, revalidateOnFocus: true });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(id?: number) {
    await mutate(
      async (current) => {
        await api.post(`${KEY}/read`, id ? { id } : {});
        if (!current) return current;
        const now = Math.floor(Date.now() / 1000);
        const items = current.items.map((n) => (!id || n.id === id) && !n.read_at ? { ...n, read_at: now } : n);
        return { items, unread: items.filter((n) => !n.read_at).length };
      },
      { revalidate: false },
    );
  }

  function openItem(n: AppNotification) {
    setOpen(false);
    if (!n.read_at) void markRead(n.id);
    if (n.link) navigate(n.link);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={unread ? `通知，${unread} 条未读` : "通知"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-medium text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="通知中心"
          className={cn(
            "absolute top-full z-50 mt-2 flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">通知</p>
            <button
              type="button"
              onClick={() => markRead()}
              disabled={!unread}
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
            >
              <CheckCheck className="size-3.5" /> 全部已读
            </button>
          </div>
          {data?.items.length ? (
            <ul className="overflow-y-auto">
              {data.items.map((n) => {
                const { icon: Icon, tone } = ICONS[n.kind] ?? ICONS.task;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted", !n.read_at && "bg-primary-soft/40")}
                    >
                      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", tone)}>
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm leading-snug text-pretty", !n.read_at && "font-medium")}>{n.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{formatTime(n.created_at)}</span>
                      </span>
                      {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="未读" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">暂无通知</p>
          )}
        </div>
      )}
    </div>
  );
}
