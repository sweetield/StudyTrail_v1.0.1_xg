export type ProgressStatus = "doing" | "submitted" | "approved" | "rejected";

export interface Me {
  id: number;
  username: string;
  name: string;
  role: "admin" | "student";
  class_id: number | null;
  class_name: string | null;
  avatar_id: string | null;
  must_change_password: boolean;
}

export interface StudentTask {
  id: number;
  title: string;
  tech_tags: string;
  due_date: string | null;
  require_review: number;
  priority: number;
  created_at: number;
  step_count: number;
  status: ProgressStatus | null;
  percent: number;
  updated_at: number | null;
  review_comment: string | null;
  score: number | null;
  /** 辅导员最近一次督促的倒计时截止时间（Unix 秒） */
  urge_due_at?: number | null;
  urge_message?: string | null;
}

export interface Step {
  id: number;
  title: string;
  position: number;
  done?: boolean;
}

export interface Progress {
  task_id: number;
  user_id: number;
  status: ProgressStatus;
  percent: number;
  note: string;
  link: string;
  review_comment: string;
  score: number | null;
  submitted_at: number | null;
  reviewed_at: number | null;
  updated_at: number;
}

export interface ProgressEvent {
  id: number;
  action: "submit" | "withdraw" | "approve" | "reject";
  comment: string;
  score: number | null;
  actor_name: string | null;
  created_at: number;
}

export interface AppNotification {
  id: number;
  kind: "task" | "submit" | "approve" | "reject" | "reply" | "urge";
  title: string;
  link: string;
  read_at: number | null;
  created_at: number;
}

export interface StudyLog {
  id: number;
  minutes: number;
  content: string;
  log_date: string;
  created_at?: number;
  task_id?: number | null;
  task_title?: string | null;
  /** 学员是否仍可编辑：已有更新的日志或辅导员留言后为 false */
  editable?: boolean;
  files?: FileMeta[];
  replies?: LogReply[];
}

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  created_at: number;
}

export interface LogReply {
  id: number;
  content: string;
  created_at: number;
  author_name: string;
}

export interface ClassItem {
  id: number;
  name: string;
  student_count: number;
}

export interface AdminTask {
  id: number;
  title: string;
  tech_tags: string;
  class_id: number | null;
  class_name: string | null;
  class_names: string | null;
  due_date: string | null;
  status: "draft" | "published" | "archived";
  require_review: number;
  priority: number;
  created_at: number;
  step_count: number;
  assigned: number;
  approved: number;
  submitted: number;
  doing: number;
}

export interface AdminStudent {
  id: number;
  username: string;
  name: string;
  class_id: number | null;
  class_name: string | null;
  avatar_id: string | null;
  active: number;
  must_change_password: number;
  last_login_at: number | null;
  last_active_at: number | null;
  assigned: number;
  completed: number;
  minutes: number;
}
