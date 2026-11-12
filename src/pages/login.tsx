import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import useSWR from "swr";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input, PageLoader } from "@/components/ui";

export function LoginPage() {
  const { user, isLoading, refresh } = useMe();
  const { data: setup } = useSWR<{ needsSetup: boolean }>("/api/auth/setup");
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  if (isLoading) return <PageLoader />;
  if (user) return <Navigate to={user.role === "admin" ? "/admin" : "/app"} replace />;
  if (setup?.needsSetup) return <Navigate to="/setup" replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/login", { username: form.get("username"), password: form.get("password") });
      const res = await refresh();
      const from = (location.state as { from?: string } | null)?.from;
      const role = res?.user?.role;
      const fallback = role === "admin" ? "/admin" : "/app";
      navigate(from && from.startsWith(role === "admin" ? "/admin" : "/app") ? from : fallback, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="欢迎回来" description="使用管理员分配的账号登录，记录你的学习进度。">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="用户名" htmlFor="username">
          <Input id="username" name="username" autoComplete="username" required autoFocus placeholder="例如 zhangsan" className="h-11" />
        </Field>
        <Field label="密码" htmlFor="password">
          <div className="relative">
            <Input id="password" name="password" type={showPw ? "text" : "password"} autoComplete="current-password" required className="h-11 pr-11" />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={showPw ? "隐藏密码" : "显示密码"}
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        {error && (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={loading} className="mt-2">
          登录
        </Button>
        <p className="text-center text-xs text-muted-foreground">忘记密码请联系管理员重置</p>
      </form>
    </AuthLayout>
  );
}
