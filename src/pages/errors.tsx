import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import { FileQuestion, RefreshCw, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/app-shell";
import { Button, buttonVariants } from "@/components/ui";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { forceReload, isChunkLoadError, reloadOnceForNewVersion } from "@/lib/chunk-reload";

function ErrorLayout({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  useDocumentTitle(title);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo className="text-lg" />
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-7">{icon}</div>
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold text-balance">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <ErrorLayout icon={<FileQuestion />} title="页面不存在" description="你访问的地址可能已被移除或输入有误。">
      <Link to="/" className={buttonVariants()}>
        返回首页
      </Link>
    </ErrorLayout>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  // 新版本发布后旧页面的分包文件会失效，自动刷新一次加载最新版本
  if (isChunkLoadError(error)) {
    if (reloadOnceForNewVersion()) return null;
    return (
      <ErrorLayout icon={<RefreshCw />} title="系统已更新" description="学迹刚刚发布了新版本，请刷新页面以加载最新内容。">
        <Button onClick={forceReload}>
          <RefreshCw /> 刷新页面
        </Button>
      </ErrorLayout>
    );
  }

  console.error(error);
  return (
    <ErrorLayout icon={<TriangleAlert />} title="页面出错了" description="页面加载时发生意外错误，请刷新重试。如果问题持续出现，请联系管理员。">
      <Button onClick={() => window.location.reload()}>
        <RefreshCw /> 刷新页面
      </Button>
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        返回首页
      </Link>
    </ErrorLayout>
  );
}
