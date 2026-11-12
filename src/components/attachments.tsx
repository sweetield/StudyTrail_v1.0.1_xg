import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { FileText, Loader2, MessageSquareText, Paperclip, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { FileMeta, LogReply } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { Markdown } from "./markdown";
import { useToast } from "./toast";
import { Button } from "./ui";

export const MAX_UPLOAD_MB = 20;
export const MAX_ATTACHMENTS = 5;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const IMAGE_MIME = /^image\/(jpeg|png|gif|webp|bmp|avif)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const PROGRESS_ARCHIVE_EXT = /\.(7z|tar)$/i;
const DANGEROUS_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|html?|svg|php|phtml|exe|dll|bat|cmd|ps1|sh|jar|msi|vbs|scr)$/i;
export const ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/bmp,image/avif,.7z,.tar";

/** 所有附件统一限制为图片和 .7z / .tar 压缩包，不支持 PDF、Office 文档、脚本等格式 */
function isAllowedUpload(file: File) {
  if (DANGEROUS_EXT.test(file.name)) return false;
  if (PROGRESS_ARCHIVE_EXT.test(file.name)) return true;
  return IMAGE_EXT.test(file.name) && (!file.type || IMAGE_MIME.test(file.type));
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function fileUrl(id: string) {
  return `/api/files/${id}`;
}

export function isImageFile(file: Pick<FileMeta, "mime">) {
  return IMAGE_MIME.test(file.mime);
}

export function FileChips({
  files,
  onRemove,
  disabled,
  className,
}: {
  files: FileMeta[];
  onRemove?: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (!files.length) return null;
  const images = files.filter(isImageFile);
  const others = files.filter((file) => !isImageFile(file));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((file) => (
            <div key={file.id} className="group relative overflow-hidden rounded-lg border bg-muted">
              <a href={fileUrl(file.id)} target="_blank" rel="noreferrer" title={file.name} className="block">
                <img src={fileUrl(file.id)} alt={file.name} loading="lazy" className="aspect-4/3 w-full object-cover" />
              </a>
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-xs text-white">{file.name}</span>
              {onRemove && !disabled && (
                <button
                  type="button"
                  onClick={() => onRemove(file.id)}
                  className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-md bg-black/55 text-white transition-colors hover:bg-destructive"
                  aria-label={`删除附件 ${file.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {others.map((file) => (
            <li key={file.id} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a href={fileUrl(file.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-primary" title={file.name}>
                {file.name}
              </a>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
              {onRemove && !disabled && (
                <button
                  type="button"
                  onClick={() => onRemove(file.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                  aria-label={`删除附件 ${file.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FileUploader({
  files,
  onUploaded,
  onRemoved,
  scope,
  taskId,
  disabled,
  max = MAX_ATTACHMENTS,
  hint,
}: {
  files: FileMeta[];
  onUploaded: (file: FileMeta) => void;
  onRemoved: (id: string) => void;
  scope: "log" | "progress";
  taskId?: number;
  disabled?: boolean;
  max?: number;
  hint?: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const current = files.length;

  async function uploadFiles(selected: File[]) {
    if (!selected.length) return;
    if (current >= max) {
      toast(`最多上传 ${max} 个附件`, "error");
      return;
    }
    const room = max - current;
    if (selected.length > room) toast(`最多还能上传 ${room} 个附件，多出的已忽略`, "error");

    setUploading(true);
    for (const file of selected.slice(0, room)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast(`「${file.name}」超过 ${MAX_UPLOAD_MB} MB，已跳过`, "error");
        continue;
      }
      if (!file.size) {
        toast(`「${file.name}」是空文件，已跳过`, "error");
        continue;
      }
      if (!isAllowedUpload(file)) {
        toast(`「${file.name}」格式不支持，仅支持图片和 .7z / .tar 压缩包，不支持 PDF、Office 文档、脚本等格式`, "error");
        continue;
      }
      const form = new FormData();
      form.set("file", file);
      form.set("scope", scope);
      if (taskId) form.set("task_id", String(taskId));
      try {
        const res = await api.upload<{ file: FileMeta }>("/api/files", form);
        onUploaded(res.file);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    }
    setUploading(false);
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.currentTarget.value = "";
    await uploadFiles(selected);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragActive(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    setDragActive(false);
    void uploadFiles(Array.from(e.dataTransfer.files));
  }

  async function remove(id: string) {
    if (!confirm("确定删除这个附件吗？")) return;
    try {
      await api.del(`/api/files/${id}`);
      onRemoved(id);
      toast("附件已删除");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl transition-colors",
        !disabled && "border border-dashed p-2.5",
        dragActive && !disabled && "border-primary bg-primary-soft/50",
      )}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <FileChips files={files} onRemove={remove} disabled={disabled} />
      {!disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={onPick}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || current >= max}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
              {uploading ? "上传中…" : dragActive ? "松开即可上传" : "上传图片 / 文件"}
            </Button>
            <span className="text-xs text-muted-foreground">{dragActive ? "把文件拖到这里" : "也可以直接把图片或文件拖拽到这里"}</span>
          </div>
        </>
      )}
      {!disabled && (
        <p className="text-xs text-muted-foreground">
          {hint ??
            `支持拖拽图片（JPG、PNG、GIF、WebP、BMP、AVIF）和 .7z / .tar 压缩包，单个不超过 ${MAX_UPLOAD_MB} MB，最多 ${max} 个；不支持 PDF、Office 文档、脚本、Markdown 等格式，图片会直接显示。`}
        </p>
      )}
    </div>
  );
}

export function ReplyThread({ replies, className }: { replies?: LogReply[]; className?: string }) {
  if (!replies?.length) return null;
  return (
    <div className={cn("mt-2 flex flex-col gap-2", className)}>
      {replies.map((reply) => (
        <div key={reply.id} className="rounded-lg border border-primary/15 bg-primary-soft/60 px-3 py-2 text-sm">
          <p className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-primary">
            <MessageSquareText className="size-3.5" aria-hidden="true" />
            辅导员回复 · {reply.author_name} · {formatTime(reply.created_at)}
          </p>
          <Markdown source={reply.content} className="text-sm" />
        </div>
      ))}
    </div>
  );
}
