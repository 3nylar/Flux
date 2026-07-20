import Link from "next/link";
import { auth } from "@/lib/auth";
import { fluxFetch } from "@/lib/fluxServer";
import { MeterWidget } from "@/components/MeterWidget";
import { Card } from "@/components/ui/Card";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { Zap, TrendingUp, ListChecks } from "lucide-react";

interface SessionSummary {
  id: string;
  state: string;
  total_sats: number;
  rate_per_tick_sats: number;
  tick_interval_seconds: number;
  started_at: string | null;
  stopped_at: string | null;
}

export default async function DashboardOverviewPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const name = session?.user?.name || session?.user?.email || "there";

  let sessions: SessionSummary[] = [];
  let totalSats = 0;
  let activeCount = 0;

  if (userId) {
    try {
      const qs = new URLSearchParams({ external_user_id: userId, limit: "5", offset: "0" });
      const result = (await fluxFetch(`/v1/sessions?${qs.toString()}`)) as { data: SessionSummary[] };
      sessions = result.data;
      totalSats = sessions.reduce((sum, s) => sum + s.total_sats, 0);
      activeCount = sessions.filter((s) => s.state === "running" || s.state === "degraded").length;
    } catch {
      // Flux API unreachable -- render the page anyway with empty stats
      // rather than a hard error, since starting a new session below will
      // surface the real error if it's still down.
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-ink-soft mt-1">Signed in as {name}</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-5">
        <StatCard icon={Zap} label="Active sessions" value={String(activeCount)} />
        <StatCard icon={TrendingUp} label="Sats (last 5 sessions)" value={totalSats.toLocaleString()} />
        <StatCard icon={ListChecks} label="Recent sessions" value={String(sessions.length)} />
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Recent sessions</h2>
            <Link href="/dashboard/sessions" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          <SessionsTable sessions={sessions} />
        </div>
        <div className="lg:col-span-2 flex justify-center lg:justify-start">
          <MeterWidget />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-ink-faint text-xs mb-2">
        <Icon size={14} />
        {label}
      </div>
      <p className="font-mono-num text-2xl font-semibold">{value}</p>
    </Card>
  );
}
