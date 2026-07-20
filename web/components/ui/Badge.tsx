import { clsx } from "clsx";

type BadgeTone = "neutral" | "success" | "danger" | "amber" | "primary" | "accent";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-canvas-alt text-ink-soft border-line",
  success: "bg-success-soft text-success border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  amber: "bg-amber-soft text-amber border-transparent",
  primary: "bg-primary-soft text-primary border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
