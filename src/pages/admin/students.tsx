import { useDeferredValue, useState, type FormEvent } from "react";
import { Link } from "react-router";
import useSWR, { mutate } from "swr";
import { FileUp, Pencil, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminStudent, ClassItem } from "@/lib/types";
import { PASSWORD_HINT, PASSWORD_PATTERN, cn, formatMinutes, formatTime, generatePassword } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, PageHeader, PageLoader, ProgressBar, Select, Textarea } from "@/components/ui";

const refreshAdmin = () => mutate((k) => typeof k === "string" && k.startsWith("/api/admin/"));

export default function AdminStudents() {
  const { data } = useSWR<{ students: AdminStudent[] }>("/api/admin/students");
  const { data: classData } = useSWR<{ classes: ClassItem[] }>("/api/admin/classes");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [dialog, setDialog] = useState<"add" | "batch" | "classes" | null>(null);
  const [editing, setEditing] = useState<AdminStudent | null>(null);
  const q = useDeferredValue(query.trim().toLowerCase());

  if (!data || !classData) return <PageLoader />;
  const classes = classData.classes;

  const list = data.students.filter(
    (s) =>
      (!classFilter || (classFilter === "none" ? !s.class_id : String(s.class_id) === classFilter)) &&
      (!q || s.name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="学员管理"
        description={`共 ${data.students.length} 名学员 · ${classes.length} 个班级`}
        action={
          <>
            <Button variant="outline" onClick={() => setDialog("classes")}>
              <Users /> 班级管理
            </Button>
            <Button variant="outline" onClick={() => setDialog("batch")}>
              <FileUp /> 批量导入
            </Button>
            <Button onClick={() => setDialog("add")}>
              <UserPlus /> 添加学员
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名或用户名" className="pl-9" aria-label="搜索学员" />
        </div>
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="sm:w-48" aria-label="按班级筛选">
          <option value="">全部班级</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">未分班</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">学员</th>
                  <th className="px-3 py-2.5 font-medium">班级</th>
                  <th className="px-3 py-2.5 font-medium">任务完成</th>
                  <th className="px-3 py-2.5 font-medium">学习时长</th>
                  <th className="px-3 py-2.5 font-medium">最近活跃</th>
                  <th className="px-5 py-2.5 text-right font-medium">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((s) => {
                  const rate = s.assigned ? Math.round((s.completed / s.assigned) * 100) : 0;
                  return (
                    <tr key={s.id} className={cn("hover:bg-muted/40", !s.active && "opacity-55")}>
                      <td className="px-5 py-3">
                        <Link to={`/admin/students/${s.id}`} className="flex items-center gap-3">
                          <Avatar name={s.name} avatarId={s.avatar_id} className="size-8 text-xs" />
                          <span>
                            <span className="flex items-center gap-1.5 font-medium hover:text-primary">
                              {s.name}
                              {!s.active && <Badge>已停用</Badge>}
                              {!!s.must_change_password && s.active && <Badge tone="outline">未改初始密码</Badge>}
                            </span>
                            <span className="block text-xs text-muted-foreground">{s.username}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{s.class_name ?? "未分班"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={rate} className="w-20" />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {s.completed}/{s.assigned}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatMinutes(s.minutes)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{formatTime(s.last_active_at ?? s.last_login_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label={`编辑 ${s.name}`}>
                          <Pencil />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Users />}
            title={data.students.length ? "没有匹配的学员" : "还没有学员"}
            description={data.students.length ? undefined : "可以逐个添加，也可以从 Excel 复制名单批量导入"}
            action={!data.students.length && <Button onClick={() => setDialog("batch")}>批量导入学员</Button>}
          />
        )}
      </Card>

      <AddStudentDialog open={dialog === "add"} onClose={() => setDialog(null)} classes={classes} />
      <BatchImportDialog open={dialog === "batch"} onClose={() => setDialog(null)} classes={classes} />
      <ClassesDialog open={dialog === "classes"} onClose={() => setDialog(null)} classes={classes} />
      <EditStudentDialog student={editing} onClose={() => setEditing(null)} classes={classes} />
    </div>
  );
}

function ErrorText({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
      {error}
    </p>
  );
}

function ClassSelect({ classes, defaultValue, id = "class_id" }: { classes: ClassItem[]; defaultValue?: number | null; id?: string }) {
  return (
    <Select id={id} name="class_id" defaultValue={defaultValue ?? ""}>
      <option value="">未分班</option>
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

function useFormAction(onDone: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<void>) {
    setLoading(true);
    setError("");
    try {
      await fn();
      await refreshAdmin();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return { loading, error, run };
}

function AddStudentDialog({ open, onClose, classes }: { open: boolean; onClose: () => void; classes: ClassItem[] }) {
  const toast = useToast();
  const { loading, error, run } = useFormAction(onClose);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(async () => {
      await api.post("/api/admin/students", {
        username: f.get("username"),
        name: f.get("name"),
        password: f.get("password"),
        class_id: f.get("class_id") ? Number(f.get("class_id")) : null,
      });
      toast("学员已添加");
    });
  }
  return (
    <Dialog open={open} onClose={onClose} title="添加学员" description="学员首次登录需修改初始密码">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="姓名" htmlFor="name">
            <Input id="name" name="name" required maxLength={32} />
          </Field>
          <Field label="用户名" htmlFor="username">
            <Input id="username" name="username" required pattern="[a-zA-Z0-9_.\-]+" maxLength={32} placeholder="学号或拼音" />
          </Field>
        </div>
        <Field label="初始密码" htmlFor="password" hint={PASSWORD_HINT}>
          <Input id="password" name="password" required pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} defaultValue={generatePassword()} className="font-mono" autoComplete="off" />
        </Field>
        <Field label="班级" htmlFor="class_id">
          <ClassSelect classes={classes} />
        </Field>
        <ErrorText error={error} />
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

function BatchImportDialog({ open, onClose, classes }: { open: boolean; onClose: () => void; classes: ClassItem[] }) {
  const toast = useToast();
  const { loading, error, run } = useFormAction(onClose);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(async () => {
      const res = await api.post<{ created: number; skipped: number }>("/api/admin/students/batch", {
        lines: f.get("lines"),
        password: f.get("password"),
        class_id: f.get("class_id") ? Number(f.get("class_id")) : null,
      });
      toast(`成功导入 ${res.created} 人${res.skipped ? `，跳过 ${res.skipped} 个重复用户名` : ""}`);
    });
  }
  return (
    <Dialog open={open} onClose={onClose} title="批量导入学员" description="每行一名学员：用户名 + 姓名，可直接从 Excel 复制两列粘贴">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="学员名单" htmlFor="lines" hint="用户名与姓名之间用空格、逗号或 Tab 分隔，单次最多 500 人">
          <Textarea id="lines" name="lines" required rows={8} className="font-mono text-xs" placeholder={"2024001 张三\n2024002 李四\nwangwu,王五"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="统一初始密码" htmlFor="batch-password" hint={PASSWORD_HINT}>
            <Input id="batch-password" name="password" required pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} defaultValue={generatePassword()} className="font-mono" autoComplete="off" />
          </Field>
          <Field label="导入到班级" htmlFor="batch-class">
            <ClassSelect classes={classes} id="batch-class" />
          </Field>
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" loading={loading}>
            开始导入
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditStudentDialog({ student, onClose, classes }: { student: AdminStudent | null; onClose: () => void; classes: ClassItem[] }) {
  const toast = useToast();
  const { loading, error, run } = useFormAction(onClose);
  const [resetPw, setResetPw] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(async () => {
      await api.patch(`/api/admin/students/${student!.id}`, {
        name: f.get("name"),
        class_id: f.get("class_id") ? Number(f.get("class_id")) : null,
        active: f.get("active") === "on",
        ...(resetPw ? { password: resetPw } : {}),
      });
      setResetPw("");
      toast(resetPw ? "已保存并重置密码" : "已保存");
    });
  }

  function remove() {
    if (!confirm(`确定删除学员「${student!.name}」吗？其所有进度与日志将被永久删除。若只是暂时不用，建议停用账号。`)) return;
    run(async () => {
      await api.del(`/api/admin/students/${student!.id}`);
      toast("学员已删除");
    });
  }

  return (
    <Dialog open={!!student} onClose={onClose} title={`编辑学员：${student?.name ?? ""}`} description={student?.username}>
      {student && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="姓名" htmlFor="edit-name">
              <Input id="edit-name" name="name" required maxLength={32} defaultValue={student.name} />
            </Field>
            <Field label="班级" htmlFor="edit-class">
              <ClassSelect classes={classes} defaultValue={student.class_id} id="edit-class" />
            </Field>
          </div>
          <Field label="重置密码" htmlFor="reset-pw" hint={`留空则不修改；${PASSWORD_HINT}；重置后学员需重新登录并修改密码`}>
            <Input id="reset-pw" value={resetPw} onChange={(e) => setResetPw(e.target.value)} pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} placeholder="输入新的初始密码" autoComplete="off" />
          </Field>
          <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
            <input type="checkbox" name="active" defaultChecked={!!student.active} className="size-4 accent-primary" />
            <span>
              <span className="block font-medium">账号启用</span>
              <span className="block text-xs text-muted-foreground">停用后无法登录，数据保留</span>
            </span>
          </label>
          <ErrorText error={error} />
          <div className="flex items-center justify-between gap-2">
            <Button variant="destructive-ghost" onClick={remove}>
              <Trash2 /> 删除
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" loading={loading}>
                保存
              </Button>
            </div>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ClassesDialog({ open, onClose, classes }: { open: boolean; onClose: () => void; classes: ClassItem[] }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/admin/classes", { name });
      setName("");
      await refreshAdmin();
      toast("班级已创建");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function rename(c: ClassItem) {
    const next = prompt("新的班级名称", c.name)?.trim();
    if (!next || next === c.name) return;
    await api.patch(`/api/admin/classes/${c.id}`, { name: next }).catch((e) => toast((e as Error).message, "error"));
    await refreshAdmin();
  }

  async function remove(c: ClassItem) {
    if (!confirm(`删除班级「${c.name}」？该班学员将变为未分班，指定给该班的任务将改为面向全部学员。`)) return;
    await api.del(`/api/admin/classes/${c.id}`);
    await refreshAdmin();
    toast("班级已删除");
  }

  return (
    <Dialog open={open} onClose={onClose} title="班级管理" description="按班级发布任务、查看进度矩阵">
      <div className="flex flex-col gap-4">
        <form onSubmit={add} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：前端 2026 春季班" maxLength={40} required aria-label="班级名称" />
          <Button type="submit">
            <Plus /> 创建
          </Button>
        </form>
        <ErrorText error={error} />
        {classes.length ? (
          <Card>
            <CardHeader title={`已有 ${classes.length} 个班级`} className="py-3" />
            <ul className="divide-y">
              {classes.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="flex-1 text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{c.student_count} 人</span>
                  <Button variant="ghost" size="icon" onClick={() => rename(c)} aria-label={`重命名 ${c.name}`}>
                    <Pencil />
                  </Button>
                  <Button variant="destructive-ghost" size="icon" onClick={() => remove(c)} aria-label={`删除 ${c.name}`}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState title="还没有班级" description="不分班也可以使用，所有任务默认面向全部学员" />
        )}
      </div>
    </Dialog>
  );
}
