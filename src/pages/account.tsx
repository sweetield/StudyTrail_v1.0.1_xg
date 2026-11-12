import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { PASSWORD_HINT, PASSWORD_PATTERN } from "@/lib/utils";
import { useNavigate } from "react-router";
import { ImagePlus, ShieldAlert, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { Button, Card, CardHeader, Field, Input, PageHeader } from "@/components/ui";

const MAX_AVATAR_MB = 5;

export default function AccountPage() {
  const { user, refresh } = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    if (form.get("newPassword") !== form.get("confirm")) return setError("两次输入的新密码不一致");
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/password", { oldPassword: form.get("oldPassword"), newPassword: form.get("newPassword") });
      const wasForced = user?.must_change_password;
      await refresh();
      formEl.reset();
      toast("密码已更新");
      if (wasForced) navigate(user?.role === "admin" ? "/admin" : "/app", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="账号与头像" description={`${user?.name} · ${user?.username}`} />
      {user?.must_change_password && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>你正在使用管理员设置的初始密码，为了账号安全，请先修改密码后再继续使用。</p>
        </div>
      )}
      <AvatarCard />
      <Card className="max-w-lg">
        <CardHeader title="修改密码" description="修改后其他设备上的登录会自动失效" />
        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5">
          <Field label="当前密码" htmlFor="oldPassword">
            <Input id="oldPassword" name="oldPassword" type="password" required autoComplete="current-password" />
          </Field>
          <Field label="新密码" htmlFor="newPassword" hint={PASSWORD_HINT}>
            <Input id="newPassword" name="newPassword" type="password" required pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} autoComplete="new-password" />
          </Field>
          <Field label="确认新密码" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" required pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} autoComplete="new-password" />
          </Field>
          {error && (
            <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" loading={loading} className="self-start">
            保存新密码
          </Button>
        </form>
      </Card>
    </div>
  );
}

function AvatarCard() {
  const { user, refresh } = useMe();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    if (!/^image\//i.test(file.type)) {
      toast("请选择图片文件", "error");
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      toast(`头像不能超过 ${MAX_AVATAR_MB} MB`, "error");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    setUploading(true);
    try {
      await api.upload("/api/avatars", form);
      await refresh();
      toast("头像已更新");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (!confirm("确定删除当前头像吗？")) return;
    setRemoving(true);
    try {
      await api.del("/api/avatars");
      await refresh();
      toast("头像已删除");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader title="个人头像" description="头像会显示在导航栏、学员列表和任务进度中，所有登录用户可见" />
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar name={user?.name ?? "?"} avatarId={user?.avatar_id} className="size-20 text-2xl" />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,image/avif" className="hidden" onChange={onPick} />
            <Button type="button" variant="outline" loading={uploading} onClick={() => inputRef.current?.click()}>
              <ImagePlus /> {user?.avatar_id ? "更换头像" : "上传头像"}
            </Button>
            {user?.avatar_id && (
              <Button type="button" variant="destructive-ghost" loading={removing} onClick={remove}>
                <Trash2 /> 删除头像
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">支持 JPG、PNG、GIF、WebP、BMP、AVIF，单个不超过 {MAX_AVATAR_MB} MB；头像会加密保存。</p>
        </div>
      </div>
    </Card>
  );
}
