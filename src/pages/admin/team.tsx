import { useState, type FormEvent } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { History, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { PASSWORD_HINT, PASSWORD_PATTERN, formatTime, generatePassword } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, PageHeader, PageLoader, SegmentedTabs } from "@/components/ui";

interface Member {
  id: number;
  username: string;
  name: string;
  active: number;
  must_change_password: number;
  last_login_at: number | null;
  created_at: number;
  avatar_id: string | null;
}

interface AuditItem {
  id: number;
  actor_name: string;
  action: string;
  target: string;
  ip: string;
  created_at: number;
}

interface AuditPage {
  items: AuditItem[];
  nextCursor: number | null;
}

const TABS = [
  { key: "members", label: "辅导员账号" },
  { key: "audit", label: "操作日志" },
] as const;

export default function AdminTeam() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("members");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="团队与安全" description="管理辅导员账号，查看所有管理操作的审计记录" />
      <SegmentedTabs options={TABS} value={tab} onChange={setTab} label="团队与安全" />
      {tab === "members" ? <MembersPanel /> : <AuditPanel />}
    </div>
  );
}

function MembersPanel() {
  const { data, mutate } = useSWR<{ members: Member[] }>("/api/admin/team/members");
  const { user } = useMe();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [resetTarget, setResetTarget] = useState<Member | null>(null);

  if (!data) return <PageLoader />;

  async function toggleActive(m: Member) {
    if (m.active && !confirm(`确定停用「${m.name}」吗？该账号将被立即登出且无法登录。`)) return;
    try {
      await api.patch(`/api/admin/team/members/${m.id}`, { active: !m.active });
      await mutate();
      toast(m.active ? "账号已停用" : "账号已启用");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <Card>
      <CardHeader
        title="辅导员账号"
        description={`共 ${data.members.length} 个，均拥有完整管理权限`}
        action={
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlus /> 添加辅导员
          </Button>
        }
      />
      <ul className="divide-y">
        {data.members.map((m) => {
          const isMe = m.id === user?.id;
          return (
            <li key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={m.name} avatarId={m.avatar_id} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{m.username}</span>
                    {isMe && <Badge tone="primary">当前账号</Badge>}
                    {!m.active && <Badge tone="destructive">已停用</Badge>}
                    {!!m.must_change_password && m.active === 1 && <Badge tone="warning">待改初始密码</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {m.last_login_at ? `最近登录 ${formatTime(m.last_login_at)}` : "从未登录"} · 创建于 {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
              {!isMe && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => setResetTarget(m)} disabled={!m.active}>
                    <KeyRound /> 重置密码
                  </Button>
                  <Button size="sm" variant={m.active ? "destructive-ghost" : "outline"} onClick={() => toggleActive(m)}>
                    {m.active ? "停用" : "启用"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <AddMemberDialog open={adding} onClose={() => setAdding(false)} onDone={() => mutate()} />
      <ResetPasswordDialog key={resetTarget?.id ?? "none"} target={resetTarget} onClose={() => setResetTarget(null)} />
    </Card>
  );
}

function AddMemberDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError("");
    try {
      await api.post("/api/admin/team/members", { username: f.get("username"), name: f.get("name"), password: f.get("password") });
      toast("辅导员已添加，请将用户名和初始密码告知对方");
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="添加辅导员" description="新账号拥有完整管理权限，首次登录需修改初始密码">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="姓名" htmlFor="member-name">
            <Input id="member-name" name="name" required maxLength={32} />
          </Field>
          <Field label="用户名" htmlFor="member-username">
            <Input id="member-username" name="username" required pattern="[a-zA-Z0-9_.\-]+" maxLength={32} autoComplete="off" />
          </Field>
        </div>
        <Field label="初始密码" htmlFor="member-password" hint={PASSWORD_HINT}>
          <Input id="member-password" name="password" required pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} defaultValue={generatePassword()} className="font-mono" autoComplete="off" />
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
          <Button type="submit" loading={loading}>
            添加
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({ target, onClose }: { target: Member | null; onClose: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(generatePassword);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    setLoading(true);
    try {
      await api.patch(`/api/admin/team/members/${target.id}`, { password: value });
      toast(`已重置 ${target.name} 的密码，对方需重新登录并修改`);
      onClose();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={!!target} onClose={onClose} title={`重置密码：${target?.name ?? ""}`} description="重置后该账号所有登录状态将失效">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="新的初始密码" htmlFor="reset-member-pw" hint={PASSWORD_HINT}>
          <Input id="reset-member-pw" value={value} onChange={(e) => setValue(e.target.value)} required pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} className="font-mono" autoComplete="off" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" loading={loading}>
            确认重置
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function AuditPanel() {
  const { data, size, setSize, isValidating } = useSWRInfinite<AuditPage>((index, prev: AuditPage | null) => {
    if (index === 0) return "/api/admin/team/audit";
    if (!prev?.nextCursor) return null;
    return `/api/admin/team/audit?before=${prev.nextCursor}`;
  });

  if (!data) return <PageLoader />;
  const items = data.flatMap((p) => p.items);
  const hasMore = !!data[data.length - 1]?.nextCursor;

  return (
    <Card>
      <CardHeader title="操作日志" description="记录登录、账号变更、任务与审核、数据备份恢复等关键操作，保留两年" />
      {items.length ? (
        <>
          <ul className="divide-y">
            {items.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-pretty">
                    <span className="font-medium">{a.actor_name}</span>
                    <span className="mx-1.5 text-muted-foreground">{a.action}</span>
                    {a.target && <span className="break-all">{a.target}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {formatTime(a.created_at)}
                    {a.ip && ` · ${a.ip}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="border-t p-3 text-center">
              <Button variant="ghost" size="sm" loading={isValidating && size > data.length} onClick={() => setSize(size + 1)}>
                加载更多
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={<History />} title="暂无操作记录" />
      )}
    </Card>
  );
}
