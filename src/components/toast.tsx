import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; type: "success" | "error" };
const ToastContext = createContext<(message: string, type?: Toast["type"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm shadow-lg animate-in",
              t.type === "error" && "border-destructive/30",
            )}
          >
            {t.type === "success" ? <CheckCircle2 className="size-4 text-primary" aria-hidden="true" /> : <AlertCircle className="size-4 text-destructive" aria-hidden="true" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
