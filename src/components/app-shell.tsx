import { Suspense, type ComponentType } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { KeyRound, LogOut, MoreHorizontal } from "lucide-react";
import { logout, useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PageLoader } from "./ui";
import { Avatar } from "./avatar";
import { NotificationBell } from "./notification-bell";
import { AnnouncementGate } from "./announcement-gate";
import { ChunkLoadedMarker } from "@/lib/chunk-reload";

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  badge?: number;
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold", className)}>
      <img src="/favicon.svg" alt="" className="size-7" />
      <span>学迹</span>
    </div>
  );
}

const MOBILE_TABS = 5;

export function AppShell({ nav, roleLabel }: { nav: NavItem[]; roleLabel: string }) {
  const { user } = useMe();
  const mobileTabs = nav.slice(0, MOBILE_TABS);
  const mobileMore = nav.slice(MOBILE_TABS);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center justify-between pr-3 pl-5">
          <Logo />
          <NotificationBell />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="主导航">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
                )
              }
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {!!item.badge && <span className="rounded-full bg-warning px-1.5 text-[11px] leading-5 text-white tabular-nums">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={user?.name ?? "?"} avatarId={user?.avatar_id} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {roleLabel}
                {user?.class_name ? ` · ${user.class_name}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-1 flex gap-1">
            <NavLink to="/account" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              <KeyRound className="size-3.5" /> 账号与头像
            </NavLink>
            <button onClick={handleLogout} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              <LogOut className="size-3.5" /> 退出登录
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/90 px-4 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <NotificationBell align="right" />
          {mobileMore.length > 0 && (
            <details className="group relative">
              <summary className="list-none rounded-lg p-2 text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="更多功能">
                <MoreHorizontal className="size-4" />
              </summary>
              <div className="absolute top-full right-0 z-50 mt-2 flex w-44 flex-col rounded-xl border bg-card p-1 shadow-xl">
                {mobileMore.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
                    className={({ isActive }) =>
                      cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", isActive && "text-primary")
                    }
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </details>
          )}
          <NavLink to="/account" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="账号与头像">
            <KeyRound className="size-4" />
          </NavLink>
          <button onClick={handleLogout} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="退出登录">
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pt-5 pb-24 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
            <ChunkLoadedMarker />
          </Suspense>
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="底部导航"
      >
        {mobileTabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", isActive && "text-primary")
            }
          >
            <item.icon className="size-5" />
            {item.label}
            {!!item.badge && <span className="absolute top-1 left-1/2 ml-2 size-2 rounded-full bg-warning" aria-label={`${item.badge} 条待处理`} />}
          </NavLink>
        ))}
      </nav>

      <AnnouncementGate />
    </div>
  );
}
