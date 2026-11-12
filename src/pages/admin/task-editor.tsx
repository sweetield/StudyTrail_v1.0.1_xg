import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import useSWR, { mutate } from "swr";
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminStudent, ClassItem, Step } from "@/lib/types";
import { PRIORITY_OPTIONS } from "@/lib/status";
import { splitTags } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Field, Input, PageHeader, PageLoader, Select, Textarea } from "@/components/ui";

interface TaskDetail {
  task: {
    id: number;
    title: string;
    description: string;
    tech_tags: string;
    class_id: number | null;
    due_date: string | null;
    status: string;
    require_review: number;
    priority: number;
  };
  steps: Step[];
  class_ids: number[];
  excluded_user_ids: number[];
}

type DraftStep = { key: string; id?: number; title: string };

const TAG_SUGGESTIONS = ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Vue", "Node.js", "Git", "SQL", "Python", "Docker", "Linux"];

export default function AdminTaskEditor() {
  const { id } = useParams();
  const { data, isLoading } = useSWR<TaskDetail>(id ? `/api/admin/tasks/${id}` : null);
  if (id && (isLoading || !data)) return <PageLoader />;
  return <Editor key={id ?? "new"} initial={data} />;
}

function Editor({ initial }: { initial?: TaskDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: classData } = useSWR<{ classes: ClassItem[] }>("/api/admin/classes");
  const { data: studentData } = useSWR<{ students: AdminStudent[] }>("/api/admin/students");
  const isEdit = !!initial;
  const [tags, setTags] = useState<string[]>(splitTags(initial?.task.tech_tags));
  const [tagInput, setTagInput] = useState("");
  const [classIds, setClassIds] = useState<number[]>(
    initial?.class_ids?.length ? initial.class_ids : initial?.task.class_id ? [initial.task.class_id] : [],
  );
  const [excluded, setExcluded] = useState<number[]>(initial?.excluded_user_ids ?? []);
  const [studentQuery, setStudentQuery] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>(
    initial?.steps.length ? initial.steps.map((s) => ({ key: String(s.id), id: s.id, title: s.title })) : [{ key: "n0", title: "" }],
  );
  const [requireReview, setRequireReview] = useState(initial ? !!initial.task.require_review : true);
  const [priority, setPriority] = useState(initial?.task.priority ?? 0);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  function addTag(raw: string) {
    const parts = raw.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
    if (parts.length) setTags((prev) => [...new Set([...prev, ...parts])].slice(0, 12));
    setTagInput("");
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      setTags((t) => t.slice(0, -1));
    }
  }

  function updateStep(key: string, title: string) {
    if (title.includes("\n")) {
      const lines = title.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.key === key);
        const next = [...prev];
        next.splice(idx, 1, { ...prev[idx], title: lines[0] ?? "" }, ...lines.slice(1).map((l, i) => ({ key: `n${Date.now()}${i}`, title: l })));
        return next;
      });
      return;
    }
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, title } : s)));
  }

  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const allStudents = studentData?.students ?? [];
  const eligibleStudents = allStudents.filter((s) => !classIds.length || (s.class_id != null && classIds.includes(s.class_id)));
  const studentKeyword = studentQuery.trim().toLowerCase();
  const shownStudents = studentKeyword
    ? eligibleStudents.filter((s) => s.name.toLowerCase().includes(studentKeyword) || s.username.toLowerCase().includes(studentKeyword))
    : eligibleStudents;

  function toggleClass(classId: number) {
    const next = classIds.includes(classId) ? classIds.filter((id) => id !== classId) : [...classIds, classId];
    setClassIds(next);
    // 取消某个班级后，同步移除不再属于发布范围的排除学员
    const allowed = new Set(allStudents.filter((s) => !next.length || (s.class_id != null && next.includes(s.class_id))).map((s) => s.id));
    setExcluded((prev) => prev.filter((userId) => allowed.has(userId)));
  }

  function toggleExcluded(userId: number) {
    setExcluded((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function save(e: FormEvent<HTMLFormElement>, status: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(status);
    setError("");
    const payload = {
      title: form.get("title"),
      description: form.get("description"),
      tech_tags: [...tags, ...(tagInput.trim() ? [tagInput.trim()] : [])],
      class_ids: classIds,
      excluded_user_ids: excluded,
      due_date: form.get("due_date") || null,
      status,
      require_review: requireReview,
      priority,
      steps: steps.filter((s) => s.title.trim()).map((s) => ({ id: s.id, title: s.title })),
    };
    try {
      let taskId = initial?.task.id;
      if (isEdit) await api.put(`/api/admin/tasks/${taskId}`, payload);
      else taskId = (await api.post<{ task: { id: number } }>("/api/admin/tasks", payload)).task.id;
      await mutate((key) => typeof key === "string" && key.startsWith("/api/admin/"));
      toast(status === "draft" ? "已保存为草稿" : isEdit ? "任务已更新" : "任务已发布，学员现在可以看到了");
      navigate(`/admin/tasks/${taskId}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const submitter = (status: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form!;
    if (!form.reportValidity()) return;
    save({ preventDefault() {}, currentTarget: form } as unknown as FormEvent<HTMLFormElement>, status);
  };

  return (
    <form
      className="flex flex-col gap-6"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      onSubmit={(e) => save(e, initial?.task.status === "archived" ? "archived" : "published")}>
      <div className="flex flex-col gap-3">
        <Link to={isEdit ? `/admin/tasks/${initial!.task.id}` : "/admin/tasks"} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> 返回
        </Link>
        <PageHeader
          title={isEdit ? "编辑任务" : "发布新任务"}
          description="拆分清晰的学习步骤，学员更容易坚持，也方便你掌握进度"
          action={
            <>
              {(!isEdit || initial?.task.status === "draft") && (
                <Button variant="outline" onClick={submitter("draft")} loading={saving === "draft"}>
                  保存草稿
                </Button>
              )}
              <Button type="submit" loading={saving !== null && saving !== "draft"}>
                {isEdit && initial?.task.status !== "draft" ? "保存修改" : "立即发布"}
              </Button>
            </>
          }
        />
      </div>

      {error && (
        <p className="rounded-lg bg-destructive-soft px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="基本信息" />
            <div className="flex flex-col gap-4 p-5">
              <Field label="任务标题" htmlFor="title">
                <Input id="title" name="title" required maxLength={100} defaultValue={initial?.task.title} placeholder="例如：React Hooks 实战练习" />
              </Field>
              <Field label="学习技术" htmlFor="tag-input" hint="输入后按回车添加，可点击下方推荐快速添加">
                <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                  {tags.map((t) => (
                    <span key={t} className="flex items-center gap-1 rounded-md bg-primary-soft py-0.5 pr-1 pl-2 font-mono text-xs text-primary">
                      {t}
                      <button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))} aria-label={`移除 ${t}`} className="rounded p-0.5 hover:bg-primary/10">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="tag-input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={onTagKey}
                    onBlur={() => tagInput && addTag(tagInput)}
                    className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
                    placeholder={tags.length ? "" : "React, TypeScript"}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {TAG_SUGGESTIONS.filter((s) => !tags.includes(s)).map((s) => (
                    <button key={s} type="button" onClick={() => addTag(s)} className="rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                      + {s}
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                label="任务说明"
                htmlFor="description"
                hint="支持 Markdown：标题、列表、粗体、链接、图片、代码块、表格等；学员查看时会自动渲染"
              >
                <Textarea
                  id="description"
                  name="description"
                  rows={7}
                  maxLength={10000}
                  defaultValue={initial?.task.description}
                  placeholder={"## 学习目标\n\n- 理解 React Hooks 的基本用法\n- 完成一个 Todo 示例\n\n**提交要求**：提交 GitHub 仓库链接"}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="学习步骤" description="学员逐项勾选，进度自动计算。支持粘贴多行批量添加。留空则由学员手动填写进度。" />
            <ol className="flex flex-col gap-2 p-5">
              {steps.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2">
                  <GripVertical className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                  <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <Input
                    value={s.title}
                    onChange={(e) => updateStep(s.key, e.target.value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (text.includes("\n")) {
                        e.preventDefault();
                        updateStep(s.key, s.title + text);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                        e.preventDefault();
                        setSteps((prev) => [...prev.slice(0, i + 1), { key: `n${Date.now()}`, title: "" }, ...prev.slice(i + 1)]);
                        requestAnimationFrame(() => (document.querySelectorAll<HTMLInputElement>("[data-step-input]")[i + 1])?.focus());
                      }
                    }}
                    data-step-input
                    maxLength={200}
                    placeholder={`步骤 ${i + 1}，例如：阅读官方文档并完成示例`}
                    aria-label={`步骤 ${i + 1}`}
                  />
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="上移">
                      <ArrowUp />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} aria-label="下移">
                      <ArrowDown />
                    </Button>
                    <Button variant="destructive-ghost" size="icon" onClick={() => setSteps((p) => p.filter((x) => x.key !== s.key))} aria-label="删除步骤">
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
              <Button variant="outline" className="mt-1 self-start" onClick={() => setSteps((p) => [...p, { key: `n${Date.now()}`, title: "" }])}>
                <Plus /> 添加步骤
              </Button>
            </ol>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-8 lg:self-start">
          <CardHeader title="发布设置" />
          <div className="flex flex-col gap-4 p-5">
            <Field label="发布班级" hint={classIds.length ? `仅选中的 ${classIds.length} 个班级可见，可继续排除个别学员` : "未选择班级时面向全部学员；勾选班级可缩小范围"}>
              <div className="flex flex-col gap-1.5">
                {classData?.classes.length ? (
                  classData.classes.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={classIds.includes(c.id)}
                        onChange={() => toggleClass(c.id)}
                        className="size-4 accent-primary"
                      />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{c.student_count} 人</span>
                    </label>
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                    还没有班级，任务将面向全部学员。可先在「学员管理 → 班级管理」中创建班级。
                  </p>
                )}
                {classIds.length > 0 && (
                  <button type="button" onClick={() => { setClassIds([]); setExcluded([]); }} className="self-start text-xs text-primary hover:underline">
                    清除班级选择（改为全部学员）
                  </button>
                )}
              </div>
            </Field>

            <Field label={`排除学员${excluded.length ? `（已排除 ${excluded.length} 人）` : ""}`} hint="被排除的学员不会收到任务通知，也无法看到该任务">
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="搜索姓名或用户名" className="pl-9" aria-label="搜索要排除的学员" />
                </div>
                <div className="max-h-52 overflow-y-auto rounded-lg border">
                  {shownStudents.length ? (
                    <ul className="divide-y">
                      {shownStudents.map((s) => (
                        <li key={s.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50">
                            <input type="checkbox" checked={excluded.includes(s.id)} onChange={() => toggleExcluded(s.id)} className="size-4 accent-primary" />
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{s.class_name ?? s.username}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {eligibleStudents.length ? "没有匹配的学员" : classIds.length ? "所选班级暂无学员" : "暂无学员"}
                    </p>
                  )}
                </div>
                {excluded.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {excluded.map((id) => {
                      const student = allStudents.find((s) => s.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleExcluded(id)}
                          className="flex items-center gap-1 rounded-md bg-destructive-soft px-2 py-0.5 text-xs text-destructive hover:opacity-80"
                          aria-label={`取消排除 ${student?.name ?? id}`}
                        >
                          {student?.name ?? `#${id}`}
                          <X className="size-3" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Field>
            <Field label="截止日期" htmlFor="due_date" hint="可选，临近截止时学员会看到提醒">
              <Input id="due_date" name="due_date" type="date" defaultValue={initial?.task.due_date ?? ""} />
            </Field>
            <Field label="任务优先级" htmlFor="priority" hint="高优先级任务会排在学员任务列表前面，并显示优先级标记">
              <Select id="priority" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
              <input type="checkbox" checked={requireReview} onChange={(e) => setRequireReview(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="block text-sm font-medium">需要辅导员审核</span>
                <span className="block text-xs text-muted-foreground">关闭后，学员提交即视为完成</span>
              </span>
            </label>
          </div>
        </Card>
      </div>
    </form>
  );
}
