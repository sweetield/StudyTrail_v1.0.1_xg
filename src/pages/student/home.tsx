import { useState } from "react";
import { Link } from "react-router";
import useSWR from "swr";
import { BookOpenCheck, Clock, Flame, PenLine, Trophy } from "lucide-react";
import { useMe } from "@/lib/auth";
import type { StudentTask, StudyLog } from "@/lib/types";
import { formatMinutes } from "@/lib/utils";
import { Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, StatCard } from "@/components/ui";
import { StudentTaskCard } from "@/components/student-task-card";
import { StudyChart, computeStreak, lastNDays, type DailyRow } from "@/components/study-chart";
import { LogDialog } from "@/components/log-dialog";

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export default function StudentHome() {
  const { user } = useMe();
  const { data: taskData } = useSWR<{ tasks: StudentTask[] }>("/api/me/tasks");
  const { data: logData } = useSWR<{ logs: StudyLog[]; daily: DailyRow[] }>("/api/me/logs");
  const [logOpen, setLogOpen] = useState(false);

  if (!taskData || !logData) return <PageLoader />;

  const tasks = taskData.tasks;
  const done = tasks.filter((t) => t.status === "approved").length;
  const active = tasks.filter((t) => t.status !== "approved");
  const focus = [...active].sort((a, b) => rank(a) - rank(b)).slice(0, 4);
  const weekDays = new Set(lastNDays(7));
  const weekMinutes = logData.daily.filter((d) => weekDays.has(d.log_date)).reduce((s, d) => s + d.minutes, 0);
  const streak = computeStreak(logData.daily);
  const overall = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.percent, 0) / tasks.length) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}，${user?.name}`}
        description={active.length ? `你还有 ${active.length} 个任务在进行中，继续加油` : "所有任务都已完成，太棒了"}
        action={
          <Button onClick={() => setLogOpen(true)}>
            <PenLine /> 学习打卡
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="已完成任务" value={`${done}/${tasks.length}`} hint={`整体进度 ${overall}%`} icon={<Trophy />} />
        <StatCard label="进行中" value={tasks.filter((t) => t.status === "doing" || t.status === "rejected").length} hint={`${tasks.filter((t) => t.status === "submitted").length} 个待审核`} icon={<BookOpenCheck />} />
        <StatCard label="近 7 天学习" value={formatMinutes(weekMinutes)} icon={<Clock />} />
        <StatCard label="连续打卡" value={`${streak} 天`} hint={streak ? "保持节奏" : "今天开始打卡吧"} icon={<Flame />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="flex flex-col gap-3 lg:col-span-3" aria-labelledby="focus-title">
          <div className="flex items-center justify-between">
            <h2 id="focus-title" className="font-semibold">
              继续学习
            </h2>
            <Link to="/app/tasks" className="text-sm text-primary hover:underline">
              查看全部
            </Link>
          </div>
          {focus.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {focus.map((t) => (
                <StudentTaskCard key={t.id} task={t} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState icon={<Trophy />} title={tasks.length ? "全部任务已完成" : "暂无学习任务"} description={tasks.length ? "等待辅导员发布新任务" : "辅导员发布任务后会显示在这里"} />
            </Card>
          )}
        </section>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="最近 14 天学习时长" description={`累计 ${formatMinutes(logData.daily.reduce((s, d) => s + d.minutes, 0))}`} />
            <div className="px-5 pt-6 pb-4">
              <StudyChart daily={logData.daily} />
            </div>
          </Card>
          <Card>
            <CardHeader
              title="最近打卡"
              action={
                <Link to="/app/logs" className="text-sm text-primary hover:underline">
                  全部
                </Link>
              }
            />
            {logData.logs.length ? (
              <ul className="divide-y">
                {logData.logs.slice(0, 4).map((l) => (
                  <li key={l.id} className="flex flex-col gap-1 px-5 py-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{l.log_date}</span>
                      <span className="tabular-nums">{formatMinutes(l.minutes)}</span>
                    </div>
                    <p className="line-clamp-2 text-sm">{l.content}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<PenLine />} title="还没有打卡记录" />
            )}
          </Card>
        </div>
      </div>

      <LogDialog open={logOpen} onClose={() => setLogOpen(false)} tasks={active} />
    </div>
  );
}

function rank(t: StudentTask) {
  const statusRank = t.status === "rejected" ? 0 : t.status === "doing" ? 1 : t.status === null ? 2 : 3;
  const due = t.due_date ? new Date(t.due_date).getTime() / 1e13 : 0.9;
  return statusRank + due;
}
