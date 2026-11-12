import { useState } from "react";
import useSWR from "swr";
import { Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { Markdown } from "./markdown";
import { Button, Dialog } from "./ui";

interface AnnouncementData {
  announcement: { content: string; updated_at: number } | null;
  show: boolean;
}

/** 登录后展示全体通告，点击“我知道了”后本次登录不再提示 */
export function AnnouncementGate() {
  const { data, mutate } = useSWR<AnnouncementData>("/api/announcement", {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const [acking, setAcking] = useState(false);

  const content = data?.announcement?.content?.trim() ?? "";
  const open = !!data?.show && !!content;

  async function acknowledge() {
    if (acking) return;
    setAcking(true);
    try {
      await api.post("/api/announcement/ack");
      await mutate({ announcement: data?.announcement ?? null, show: false }, { revalidate: false });
    } catch {
      // 确认失败时保持弹窗，用户可再次点击
    } finally {
      setAcking(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={acknowledge}
      title="全体通告"
      description="请阅读以下通知，点击「我知道了」后本次登录不再提示"
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
          <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>来自辅导员的全体通告</span>
        </div>
        <Markdown source={content} />
        <div className="flex justify-end">
          <Button onClick={acknowledge} loading={acking}>
            我知道了
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
