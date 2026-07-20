import { HTMLAttributes } from "react";
import { clsx } from "clsx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("bg-surface border border-line rounded-2xl shadow-soft", className)} {...props} />
  );
}
