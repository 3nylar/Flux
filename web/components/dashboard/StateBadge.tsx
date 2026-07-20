import { Badge } from "@/components/ui/Badge";

export function StateBadge({ state }: { state: string }) {
  const tone =
    state === "running" || state === "succeeded"
      ? "success"
      : state === "degraded"
      ? "amber"
      : state === "stopped"
      ? "neutral"
      : state === "failed"
      ? "danger"
      : "neutral";
  return <Badge tone={tone}>{state}</Badge>;
}
