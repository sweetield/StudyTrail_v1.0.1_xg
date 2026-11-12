import { useEffect } from "react";

const APP_NAME = "学迹";

export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : `${APP_NAME} · 学习进度管理系统`;
  }, [title]);
}
