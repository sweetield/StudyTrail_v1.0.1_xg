import { useState, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export const MAX_SCORE = 5;
export const SCORE_LABELS = ["", "需加强", "合格", "良好", "优秀", "非常出色"] as const;

const STARS = Array.from({ length: MAX_SCORE }, (_, i) => i + 1);

export function StarRating({ value, onChange, label = "评分" }: { value: number | null; onChange: (score: number | null) => void; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  function handleKey(e: KeyboardEvent) {
    const current = value ?? 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(MAX_SCORE, current + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(current > 1 ? current - 1 : null);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label={label} className="flex items-center" onMouseLeave={() => setHover(null)} onKeyDown={handleKey}>
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} 星 · ${SCORE_LABELS[n]}`}
            tabIndex={(value ?? 1) === n ? 0 : -1}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? null : n)}
            className="rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Star className={cn("size-7", n <= shown ? "fill-warning text-warning" : "text-border")} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ))}
      </div>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        {shown ? `${shown} 星 · ${SCORE_LABELS[shown]}` : "未评分"}
      </span>
    </div>
  );
}

export function StarScore({ score, className }: { score: number | null | undefined; className?: string }) {
  if (!score) return null;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`辅导员评分 ${score} 星（满分 ${MAX_SCORE}）`}>
      {STARS.map((n) => (
        <Star key={n} className={cn("size-3.5", n <= score ? "fill-warning text-warning" : "text-border")} strokeWidth={1.5} aria-hidden="true" />
      ))}
    </span>
  );
}
