import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function avatarUrl(avatarId?: string | null): string | null {
  return avatarId ? `/api/avatars/${avatarId}` : null;
}

export function Avatar({
  name,
  avatarId,
  className,
  imgClassName,
}: {
  name: string;
  avatarId?: string | null;
  className?: string;
  imgClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarId]);
  const url = avatarUrl(avatarId);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={`${name}的头像`}
        title={name}
        onError={() => setFailed(true)}
        className={cn("size-9 shrink-0 rounded-full border bg-muted object-cover", className, imgClassName)}
      />
    );
  }

  return (
    <span
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary", className)}
      aria-label={`${name}的头像`}
      title={name}
    >
      {name.slice(0, 1) || "?"}
    </span>
  );
}
