export function StackedBar({ approved, submitted, doing, todo }: { approved: number; submitted: number; doing: number; todo: number }) {
  const total = approved + submitted + doing + todo || 1;
  const parts = [
    { v: approved, c: "bg-primary", l: "已完成" },
    { v: submitted, c: "bg-warning", l: "待审核" },
    { v: doing, c: "bg-primary/35", l: "学习中" },
  ];
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`已完成 ${approved}，待审核 ${submitted}，学习中 ${doing}，未开始 ${todo}`}
    >
      {parts.map((p) => (p.v ? <div key={p.l} className={p.c} style={{ width: `${(p.v / total) * 100}%` }} /> : null))}
    </div>
  );
}
