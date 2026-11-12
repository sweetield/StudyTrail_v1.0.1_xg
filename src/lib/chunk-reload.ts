import { useEffect } from "react";

const RELOAD_FLAG = "st_chunk_reload";

export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

/** 返回 true 表示已触发一次自动刷新；同一会话内只自动刷新一次，防止循环 */
export function reloadOnceForNewVersion() {
  if (sessionStorage.getItem(RELOAD_FLAG)) return false;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  window.location.reload();
  return true;
}

export function forceReload() {
  sessionStorage.removeItem(RELOAD_FLAG);
  window.location.reload();
}

/** 放在 Suspense 内与懒加载页面并列：只有分包成功加载后才会挂载，此时清除刷新标记 */
export function ChunkLoadedMarker() {
  useEffect(() => {
    sessionStorage.removeItem(RELOAD_FLAG);
  }, []);
  return null;
}
