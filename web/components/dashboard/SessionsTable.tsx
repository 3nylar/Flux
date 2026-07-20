import Link from "next/link";
import { StateBadge } from "./StateBadge";
import { fmtSats, fmtDate } from "@/lib/format";

interface SessionRow {
  id: string;
  state: string;
  total_sats: number;
  rate_per_tick_sats: number;
  tick_interval_seconds: number;
  started_at: string | null;
  stopped_at: string | null;
}

export function SessionsTable({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center text-ink-soft text-sm">
        No sessions yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas-alt text-ink-faint text-xs">
            <th className="text-left font-medium px-4 py-3">Session</th>
            <th className="text-left font-medium px-4 py-3">State</th>
            <th className="text-right font-medium px-4 py-3">Total sats</th>
            <th className="text-right font-medium px-4 py-3">Rate</th>
            <th className="text-left font-medium px-4 py-3">Started</th>
            <th className="text-left font-medium px-4 py-3">Stopped</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className="border-b border-line-soft last:border-0 hover:bg-canvas-alt transition-colors">
              <td className="px-4 py-3">
                <Link href={`/dashboard/sessions/${s.id}`} className="font-mono-num text-primary hover:underline">
                  {s.id.slice(0, 12)}...
                </Link>
              </td>
              <td className="px-4 py-3"><StateBadge state={s.state} /></td>
              <td className="px-4 py-3 text-right font-mono-num">{fmtSats(s.total_sats)}</td>
              <td className="px-4 py-3 text-right font-mono-num text-ink-faint">
                {s.rate_per_tick_sats}/{s.tick_interval_seconds}s
              </td>
              <td className="px-4 py-3 text-ink-soft">{fmtDate(s.started_at)}</td>
              <td className="px-4 py-3 text-ink-soft">{fmtDate(s.stopped_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
