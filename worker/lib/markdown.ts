export interface ExportFile {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface ExportReply {
  author_name: string;
  content: string;
  created_at: number;
}

export interface ExportLog {
  log_date: string;
  minutes: number;
  content: string;
  files: ExportFile[];
  replies: ExportReply[];
}

export interface StudentExportTask {
  id: number;
  title: string;
  description: string;
  tech_tags: string;
  due_date: string | null;
  require_review: number;
  steps: { title: string; done: boolean }[];
  progress: {
    status: string;
    percent: number;
    note: string;
    link: string;
    review_comment: string;
    score: number | null;
    submitted_at: number | null;
    reviewed_at: number | null;
  } | null;
  files: ExportFile[];
  logs: ExportLog[];
}

export interface AdminExportRow {
  name: string;
  username: string;
  class_name: string | null;
  status: string | null;
  percent: number;
  note: string | null;
  link: string | null;
  review_comment: string | null;
  score: number | null;
  submitted_at: number | null;
  reviewed_at: number | null;
  files: ExportFile[];
  logs: ExportLog[];
}

export interface AdminExportTask {
  id: number;
  title: string;
  description: string;
  tech_tags: string;
  due_date: string | null;
  status: string;
  require_review: number;
  class_names: string | null;
  steps: { title: string }[];
  rows: AdminExportRow[];
}

const PROGRESS_LABEL: Record<string, string> = {
  doing: "进行中",
  submitted: "待审核",
  approved: "已完成",
  rejected: "需修改",
};

const TASK_LABEL: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};

export function parseTaskIds(value: string | undefined): number[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, 200);
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

function scoreText(score: number | null): string {
  if (!score) return "未评分";
  return `${"★".repeat(score)}${"☆".repeat(Math.max(0, 5 - score))}（${score}/5）`;
}

function block(text: string | null | undefined): string {
  const value = (text ?? "").trim();
  return value ? value.replace(/\r\n/g, "\n") : "（未填写）";
}

function fileLines(files: ExportFile[]): string {
  if (!files.length) return "";
  return files.map((file) => `- [${file.name}](/api/files/${file.id}) · ${formatBytes(file.size)}`).join("\n");
}

function replyLines(replies: ExportReply[]): string {
  if (!replies.length) return "";
  return replies.map((reply) => `- **${reply.author_name}**（${formatDateTime(reply.created_at)}）：${block(reply.content)}`).join("\n");
}

function logSection(logs: ExportLog[]): string {
  if (!logs.length) return "（暂无学习日志）\n";
  return logs
    .map((log) => {
      const parts = [`#### ${log.log_date} · ${formatMinutes(log.minutes)}`, "", block(log.content)];
      const files = fileLines(log.files);
      if (files) parts.push("", "**附件：**", files);
      const replies = replyLines(log.replies);
      if (replies) parts.push("", "**辅导员回复：**", replies);
      return parts.join("\n");
    })
    .join("\n\n");
}

function stepSection(steps: { title: string; done?: boolean }[]): string {
  if (!steps.length) return "（无固定步骤，由学员手动填写进度）\n";
  return steps.map((step, index) => `- [${step.done ? "x" : " "}] ${index + 1}. ${step.title}`).join("\n");
}

export function buildStudentMarkdown(userName: string, tasks: StudentExportTask[]): string {
  const lines: string[] = [
    "# 学习进度导出",
    "",
    `> 学员：${userName}`,
    `> 导出时间：${formatDateTime(Math.floor(Date.now() / 1000))}`,
    `> 任务数量：${tasks.length}`,
    "",
  ];

  for (const task of tasks) {
    const progress = task.progress;
    lines.push(
      "---",
      "",
      `## 任务：${task.title}`,
      "",
      `- 状态：${progress ? (PROGRESS_LABEL[progress.status] ?? progress.status) : "未开始"}`,
      `- 进度：${progress?.percent ?? 0}%`,
      `- 技术标签：${task.tech_tags || "—"}`,
      `- 截止日期：${task.due_date ?? "不限期"}`,
      `- 审核方式：${task.require_review ? "需要辅导员审核" : "无需审核"}`,
      `- 评分：${scoreText(progress?.score ?? null)}`,
      `- 提交时间：${formatDateTime(progress?.submitted_at)}`,
      `- 审核时间：${formatDateTime(progress?.reviewed_at)}`,
      "",
      "### 任务说明",
      "",
      block(task.description),
      "",
      "### 学习步骤",
      "",
      stepSection(task.steps),
      "",
      "### 学习笔记 / 遇到的问题",
      "",
      block(progress?.note),
      "",
      "### 作品 / 代码链接",
      "",
      progress?.link ? `[${progress.link}](${progress.link})` : "（未填写）",
      "",
      "### 辅导员评语",
      "",
      block(progress?.review_comment),
      "",
      "### 作品附件",
      "",
      fileLines(task.files) || "（暂无附件）",
      "",
      "### 学习日志",
      "",
      logSection(task.logs),
      "",
    );
  }

  return lines.join("\n");
}

export function buildAdminMarkdown(adminName: string, tasks: AdminExportTask[], scopeLabel: string): string {
  const lines: string[] = [
    "# 学习进度导出（管理端）",
    "",
    `> 导出人：${adminName}`,
    `> 导出范围：${scopeLabel}`,
    `> 导出时间：${formatDateTime(Math.floor(Date.now() / 1000))}`,
    `> 任务数量：${tasks.length}`,
    "",
  ];

  for (const task of tasks) {
    const approved = task.rows.filter((row) => row.status === "approved").length;
    lines.push(
      "---",
      "",
      `## 任务：${task.title}`,
      "",
      `- 发布状态：${TASK_LABEL[task.status] ?? task.status}`,
      `- 发布范围：${task.class_names || "全部学员"}`,
      `- 技术标签：${task.tech_tags || "—"}`,
      `- 截止日期：${task.due_date ?? "不限期"}`,
      `- 审核方式：${task.require_review ? "需要辅导员审核" : "无需审核"}`,
      `- 应交人数：${task.rows.length}`,
      `- 已完成：${approved}`,
      "",
      "### 任务说明",
      "",
      block(task.description),
      "",
      "### 学习步骤",
      "",
      stepSection(task.steps),
      "",
      "### 学员进度",
      "",
    );

    if (!task.rows.length) {
      lines.push("（暂无应完成学员）", "");
      continue;
    }

    for (const row of task.rows) {
      lines.push(
        `#### ${row.name}（${row.username}）${row.class_name ? ` · ${row.class_name}` : ""}`,
        "",
        `- 状态：${row.status ? (PROGRESS_LABEL[row.status] ?? row.status) : "未开始"}`,
        `- 进度：${row.percent}%`,
        `- 评分：${scoreText(row.score)}`,
        `- 提交时间：${formatDateTime(row.submitted_at)}`,
        `- 审核时间：${formatDateTime(row.reviewed_at)}`,
        `- 作品链接：${row.link ? `[${row.link}](${row.link})` : "（未填写）"}`,
        "",
        "**学习笔记：**",
        "",
        block(row.note),
        "",
        "**辅导员评语：**",
        "",
        block(row.review_comment),
        "",
        "**作品附件：**",
        "",
        fileLines(row.files) || "（暂无附件）",
        "",
        "**学习日志：**",
        "",
        logSection(row.logs),
        "",
      );
    }
  }

  return lines.join("\n");
}
