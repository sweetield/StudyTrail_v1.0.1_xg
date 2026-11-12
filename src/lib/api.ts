export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      "x-requested-with": "fetch",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `请求失败 (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T>(url: string) => request<T>("DELETE", url),
  upload: async <T>(url: string, form: FormData) => {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-requested-with": "fetch" },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `上传失败 (${res.status})`);
    return data as T;
  },
  /** 下载文件（用于 Markdown 导出等），自动读取服务端文件名 */
  download: async (url: string, fallbackName = "download") => {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "x-requested-with": "fetch" },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, (data as { error?: string }).error ?? `下载失败 (${res.status})`);
    }
    const disposition = res.headers.get("content-disposition") ?? "";
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    let name = fallbackName;
    try {
      name = decodeURIComponent(encoded?.[1] ?? plain?.[1] ?? fallbackName);
    } catch {
      name = plain?.[1] ?? fallbackName;
    }
    const href = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 部分浏览器在 click 后仍需短暂保留 Blob URL，延迟释放更稳妥
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  },
};

export const fetcher = <T>(url: string) => api.get<T>(url);
