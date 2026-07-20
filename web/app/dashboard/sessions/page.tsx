"use client";

import { useEffect, useState, useCallback } from "react";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { Button } from "@/components/ui/Button";
import { Download, Loader2 } from "lucide-react";

interface SessionRow {
  id: string;
  state: string;
  total_sats: number;
  rate_per_tick_sats: number;
  tick_interval_seconds: number;
  started_at: string | null;
  stopped_at: string | null;
  stop_reason: string | null;
}

const STATES = ["all", "running", "degraded", "stopped", "failed"] as const;

export default function SessionHistoryPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stateFilter, setStateFilter] = useState<(typeof STATES)[number]>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: "100", offset: "0" });
    if (stateFilter !== "all") qs.set("state", stateFilter);
    const res = await fetch(`/api/flux/sessions?${qs.toString()}`);
    const json = await res.json();
    if (res.ok) {
      setSessions(json.data);
      setTotal(json.pagination?.total ?? json.data.length);
    }
    setLoading(false);
  }, [stateFilter]);

  useEffect(() => {
    // Fetches session history from the server whenever the state filter
    // changes -- the standard "sync from an external source" effect
    // pattern; there's no subscription API to use useSyncExternalStore
    // with here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function exportCsv() {
    const header = "id,state,total_sats,rate_per_tick_sats,tick_interval_seconds,started_at,stopped_at,stop_reason";
    const rows = sessions.map((s) =>
      [s.id, s.state, s.total_sats, s.rate_per_tick_sats, s.tick_interval_seconds, s.started_at ?? "", s.stopped_at ?? "", s.stop_reason ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flux-sessions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Session history</h1>
          <p className="text-ink-soft mt-1">{total} total sessions</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as (typeof STATES)[number])}
            className="px-3 py-2 rounded-lg border border-line bg-canvas-alt text-sm focus:border-primary outline-none"
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All states" : s}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={sessions.length === 0}>
            <Download size={14} /> Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-ink-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <SessionsTable sessions={sessions} />
      )}
    </div>
  );
}
