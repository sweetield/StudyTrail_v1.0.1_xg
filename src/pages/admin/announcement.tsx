import { useState } from "react";
import useSWR from "swr";
import { Megaphone, Save } from "lucide-react";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, PageHeader, PageLoader, Textarea } from "@/components/ui";

interface AnnouncementData {
  content: string;
  updated_at: number | null;
}

export default function AdminAnnouncement() {
  const { data, mutate } = useSWR<AnnouncementData>("/api/admin/announcement");
  if (!data) return <PageLoader />;
  return <Editor initial={data} onSaved={(next) => mutate(next, { revalidate: false })} />;
}

function Editor({ initial, onSaved }: { initial: AnnouncementData; onSaved: (next: AnnouncementData) => Promise<unknown> }) {
  const toast = useToast();
  const [content, setContent] = useState(initial.content);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const next = await api.put<AnnouncementData>("/api/admin/announcement", { content });
      setContent(next.content);
      await onSaved(next);
      toast(next.content.trim() ? "通告已保存，成员下次登录时会看到" : "通告已清空，成员登录时不再提示");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="全体通告"
        description="发布后，成员每次登录都会看到通告弹窗，点击「我知道了」后本次登录不再提示"
        action={
          <Button onClick={save} loading={saving}>
            <Save /> 保存并发布
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="编辑通告"
            description={initial.updated_at ? `上次更新：${formatTime(initial.updated_at)}` : "尚未发布过通告"}
          />
          <div className="flex flex-col gap-3 p-5">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              maxLength={20000}
              placeholder={"# 本周学习安排\n\n- 周三前完成 React Hooks 练习\n- 周五晚 8 点线上答疑\n\n**注意**：请及时提交学习日志。"}
              aria-label="通告内容"
            />
            <p className="text-xs text-muted-foreground">
              支持 Markdown：标题、列表、粗体、链接、图片、代码块、表格等；留空保存会清空通告，成员登录时不再看到弹窗。
            </p>
            <div className="flex justify-end">
              <Button onClick={save} loading={saving}>
                <Save /> 保存并发布
              </Button>
            </div>
          </div>
        </Card>

        <Card className="lg:sticky lg:top-8 lg:self-start">
          <CardHeader title="实时预览" description="成员看到的弹窗内容" />
          <div className="p-5">
            {content.trim() ? (
              <div className="rounded-xl border bg-background p-4">
                <div className="mb-3 flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
                  <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>来自辅导员的全体通告</span>
                </div>
                <Markdown source={content} />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                暂无通告内容，成员登录时不会看到弹窗
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
