import { LayoutDashboard, ListChecks, NotebookPen } from "lucide-react";
import { AppShell, type NavItem } from "@/components/app-shell";

const nav: NavItem[] = [
  { to: "/app", label: "学习概览", icon: LayoutDashboard, end: true },
  { to: "/app/tasks", label: "我的任务", icon: ListChecks },
  { to: "/app/logs", label: "学习日志", icon: NotebookPen },
];

export function StudentLayout() {
  return <AppShell nav={nav} roleLabel="学员" />;
}
