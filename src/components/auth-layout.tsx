import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Logo } from "./app-shell";

const highlights = [
  "辅导员发布任务与技术栈，拆分为可勾选的学习步骤",
  "学员随时勾选步骤、记录笔记与作品链接，进度自动计算",
  "提交后由辅导员审核评分，退回时附带修改意见",
  "每日学习打卡与时长统计，班级进度矩阵一目了然",
];

const sample = [
  { step: "搭建开发环境", done: true },
  { step: "完成 React 基础组件练习", done: true },
  { step: "实现路由与数据请求", done: false },
];

export function AuthLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <section className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <Logo className="text-lg [&_img]:rounded-lg [&_img]:ring-2 [&_img]:ring-white/30" />
        <div className="flex max-w-md flex-col gap-8">
          <div>
            <h2 className="text-3xl leading-tight font-semibold text-balance">让每一位学员的学习轨迹清晰可见</h2>
            <p className="mt-3 text-primary-foreground/75 leading-relaxed">任务发布、自主登记、进度审核、学习打卡，一站完成。</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur" aria-hidden="true">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">React 实战入门</span>
              <span className="rounded-md bg-amber-300/90 px-2 py-0.5 text-xs font-medium text-amber-950">3 天后截止</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-2/3 rounded-full bg-white" />
            </div>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm">
              {sample.map((s) => (
                <li key={s.step} className="flex items-center gap-2.5">
                  <span className={`flex size-5 items-center justify-center rounded-md ${s.done ? "bg-white text-primary" : "ring-1 ring-white/40"}`}>
                    {s.done && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className={s.done ? "text-primary-foreground/70 line-through" : ""}>{s.step}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="flex flex-col gap-3 text-sm text-primary-foreground/85">
            {highlights.map((h) => (
              <li key={h} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden="true" />
                {h}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/60">Powered by Cloudflare Workers + D1</p>
      </section>

      <section className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </div>
  );
}
