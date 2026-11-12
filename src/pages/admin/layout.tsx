import useSWR from "swr";
import { ClipboardCheck, DatabaseBackup, Grid3x3, LayoutDashboard, ListTodo, Megaphone, ShieldCheck, Users } from "lucide-react";
import { AppShell, type NavItem } from "@/components/app-shell";
import type { OverviewData } from "./overview";

export function AdminLayout() {
  const { data } = useSWR<OverviewData>("/api/admin/overview");
  const nav: NavItem[] = [
    { to: "/admin", label: "概览", icon: LayoutDashboard, end: true },
    { to: "/admin/tasks", label: "学习任务", icon: ListTodo },
    { to: "/admin/reviews", label: "进度审核", icon: ClipboardCheck, badge: data?.counts.pending },
    { to: "/admin/students", label: "学员管理", icon: Users },
    { to: "/admin/matrix", label: "进度矩阵", icon: Grid3x3 },
    { to: "/admin/announcement", label: "全体通告", icon: Megaphone },
    { to: "/admin/data", label: "数据备份", icon: DatabaseBackup },
    { to: "/admin/team", label: "团队与安全", icon: ShieldCheck },
  ];
  return <AppShell nav={nav} roleLabel="管理员" />;
}
