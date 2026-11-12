import { useState, type FormEvent } from "react";
import { PASSWORD_HINT, PASSWORD_PATTERN } from "@/lib/utils";
import { Navigate, useNavigate } from "react-router";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input, PageLoader } from "@/components/ui";

export default function SetupPage() {
  const { data, isLoading } = useSWR<{ needsSetup: boolean }>("/api/auth/setup");
  const { refresh } = useMe();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isLoading) return <PageLoader />;
  if (data && !data.needsSetup) return <Navigate to="/login" replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("password") !== form.get("confirm")) return setError("两次输入的密码不一致");
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/setup", { username: form.get("username"), name: form.get("name"), password: form.get("password") });
      await refresh();
      navigate("/admin", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="初始化系统" description="首次使用，请创建管理员账号。创建后此页面将自动关闭。">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="管理员姓名" htmlFor="name">
          <Input id="name" name="name" required placeholder="例如 王老师" />
        </Field>
        <Field label="登录用户名" htmlFor="username" hint="字母、数字、下划线">
          <Input id="username" name="username" required autoComplete="username" placeholder="admin" />
        </Field>
        <Field label="密码" htmlFor="password" hint={PASSWORD_HINT}>
          <Input id="password" name="password" type="password" required pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} autoComplete="new-password" />
        </Field>
        <Field label="确认密码" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" required pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} autoComplete="new-password" />
        </Field>
        {error && (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={loading} className="mt-2">
          创建管理员并进入后台
        </Button>
      </form>
    </AuthLayout>
  );
}
