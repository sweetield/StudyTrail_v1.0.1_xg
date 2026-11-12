import { priorityMeta } from "@/lib/status";
import { Badge } from "./ui";

export function PriorityBadge({ priority, className }: { priority?: number | null; className?: string }) {
  const meta = priorityMeta(priority);
  if (!meta) return null;
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
