"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { fmtSats, fmtDuration } from "@/lib/format";
import { Zap, Square, Loader2, AlertTriangle } from "lucide-react";

interface SessionData {
  id: string;
  state: string;
  total_sats: number;
  rate_per_tick_sats: number;
  tick_interval_seconds: number;
  started_at: string | null;
  stopped_at: string | null;
  stop_reason: string | null;
}

const DEMO_PUBKEY = "02f6725f9c1c40333b67faea92fd211c183050f28df32cbaab5d5644b1e50496a";

type Phase = "idle" | "starting" | "running" | "stopping" | "ended";

export function MeterWidget() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState("10");
  const [interval_, setInterval_] = useState("2");
  const [flash, setFlash] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTotal = useRef(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("flux:default-session-prefs");
      if (raw) {
        const prefs = JSON.parse(raw);
        // Syncing initial state from localStorage (an external store) on
        // mount is exactly the documented use case for this pattern.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (prefs.rate) setRate(String(prefs.rate));
        if (prefs.interval) setInterval_(String(prefs.interval));
      }
    } catch {
      // localStorage unavailable or malformed -- fall back to the defaults
      // already set above.
    }
  }, []);

  async function handleStart() {
    setError(null);
    setPhase("starting");
    try {
      const res = await fetch("/api/flux/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_user_id: "demo_visitor",
          receiver_pubkey: DEMO_PUBKEY,
          rate_per_tick_sats: Number(rate),
          tick_interval_seconds: Number(interval_),
          max_duration_seconds: 300,
          max_total_sats: 5000,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not start session.");

      setSession(json.data);
      prevTotal.current = json.data.total_sats;
      // This runs inside handleStart, an async click handler -- never
      // during render -- so Date.now() here is safe. The linter can't
      // always distinguish "defined in a component body" from "called
      // during render."
      // eslint-disable-next-line react-hooks/purity
      startTimeRef.current = Date.now();
      setElapsed(0);
      setPhase("running");
      startPolling(json.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("idle");
    }
  }

  function startPolling(sessionId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/flux/sessions/${sessionId}`);
        const json = await res.json();
        if (!res.ok) return;
        const data = json.data as SessionData;
        setSession(data);
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        if (data.total_sats > prevTotal.current) {
          prevTotal.current = data.total_sats;
          setFlash(true);
          setTimeout(() => setFlash(false), 400);
        }
        if (data.state === "stopped" || data.state === "failed") {
          setPhase("ended");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // transient poll failure -- next tick will retry
      }
    }, 800);
  }

  async function handleStop() {
    if (!session) return;
    setPhase("stopping");
    try {
      const res = await fetch(`/api/flux/sessions/${session.id}/stop`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not stop session.");
      setSession(json.data);
      setPhase("ended");
      if (pollRef.current) clearInterval(pollRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("running");
    }
  }

  function reset() {
    setSession(null);
    setPhase("idle");
    setError(null);
  }

  const isRunning = phase === "running" || phase === "stopping";
  const isEnded = phase === "ended";

  return (
    <Card className="p-6 md:p-8 max-w-md w-full">
      {!isRunning && !isEnded && (
        <>
          <div className="flex items-center gap-2 mb-5">
            <Zap size={18} className="text-primary" />
            <h3 className="font-display font-semibold text-lg">Try the meter</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-ink-faint mb-1.5 block">Rate per tick (sats)</label>
              <input
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-canvas-alt text-sm font-mono-num focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-ink-faint mb-1.5 block">Tick interval (seconds)</label>
              <input
                type="number"
                value={interval_}
                onChange={(e) => setInterval_(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-canvas-alt text-sm font-mono-num focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <Button size="lg" className="w-full" onClick={handleStart} disabled={phase === "starting"}>
              {phase === "starting" && <Loader2 size={16} className="animate-spin" />}
              Start streaming
            </Button>
            <p className="text-xs text-ink-faint text-center leading-relaxed">
              Runs on Flux&apos;s simulated Lightning backend — no real
              sats, capped at 5 minutes / 5,000 sats for this demo.
            </p>
          </div>
        </>
      )}

      {(isRunning || isEnded) && session && (
        <>
          <div className="flex items-center justify-between mb-6">
            <Badge
              tone={
                session.state === "running"
                  ? "success"
                  : session.state === "degraded"
                  ? "amber"
                  : session.state === "stopped"
                  ? "neutral"
                  : "danger"
              }
            >
              {session.state}
            </Badge>
            <span className="text-xs text-ink-faint font-mono-num">{fmtDuration(elapsed)}</span>
          </div>

          <div className="text-center py-6">
            <p className="text-xs text-ink-faint mb-2">Total streamed</p>
            <p
              className={`font-mono-num text-5xl font-bold text-primary transition-transform ${
                flash ? "animate-tick-flash" : ""
              }`}
            >
              {fmtSats(session.total_sats)}
            </p>
            <p className="text-sm text-ink-faint mt-1">sats</p>
          </div>

          {isRunning && (
            <Button
              size="lg"
              variant="danger"
              className="w-full mt-4"
              onClick={handleStop}
              disabled={phase === "stopping"}
            >
              {phase === "stopping" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Square size={16} fill="currentColor" />
              )}
              Stop
            </Button>
          )}

          {isEnded && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-canvas-alt border border-line p-3 text-sm text-ink-soft text-center">
                Session ended
                {session.stop_reason ? ` — ${session.stop_reason.replace(/_/g, " ")}` : ""}.
              </div>
              <Button size="lg" variant="secondary" className="w-full" onClick={reset}>
                Start another session
              </Button>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft text-danger text-sm p-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </Card>
  );
}
