import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/use-document-title";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-muted text-foreground hover:bg-border",
        outline: "border bg-card hover:bg-muted",
        ghost: "hover:bg-muted",
        destructive: "bg-destructive text-white hover:opacity-90",
        "destructive-ghost": "text-destructive hover:bg-destructive-soft",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-12 px-5 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

export { buttonVariants };

const fieldBase =
  "w-full rounded-lg border bg-card px-3 text-sm placeholder:text-muted-foreground/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(fieldBase, "h-10 pr-8", className)} {...props} />;
});

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border bg-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-pretty">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeTones = {
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  success: "bg-primary text-primary-foreground",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive-soft text-destructive",
  outline: "border text-muted-foreground",
};

export function Badge({ tone = "muted", className, children }: { tone?: keyof typeof badgeTones; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", badgeTones[tone], className)}>{children}</span>;
}

export function TechTag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{children}</span>;
}

export function ProgressBar({ value, tone = "primary", className, label }: { value: number; tone?: "primary" | "warning" | "muted"; className?: string; label?: string }) {
  const color = tone === "warning" ? "bg-warning" : tone === "muted" ? "bg-muted-foreground/40" : "bg-primary";
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "进度"}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted-foreground", className)} aria-label="加载中" />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Dialog({ open, onClose, title, description, children, className }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn("m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-card p-0 text-foreground shadow-xl", className)}
      aria-labelledby="dialog-title"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 id="dialog-title" className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
              <X />
            </Button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function SegmentedTabs<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="flex max-w-full gap-1 self-start overflow-x-auto rounded-lg bg-muted p-1" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
            value === o.key && "bg-card font-medium text-foreground shadow-sm",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="text-xs tabular-nums opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
