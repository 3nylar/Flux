"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtSats } from "@/lib/format";
import { Wallet, Server, Sliders, Loader2, CheckCircle2 } from "lucide-react";

interface MetaData {
  lightning_provider: string;
  node_reachable: boolean;
  wallet_balance_sats: number | null;
  max_session_duration_seconds: number;
  max_total_sats_per_session: number;
  min_tick_interval_seconds: number;
}

interface BalanceData {
  balance_sats: number;
  provider: string;
}

const PREFS_KEY = "flux:default-session-prefs";

export default function SettingsPage() {
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const [defaultRate, setDefaultRate] = useState("10");
  const [defaultInterval, setDefaultInterval] = useState("2");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const [metaRes, balanceRes] = await Promise.all([
        fetch("/api/flux/meta"),
        fetch("/api/flux/wallet/balance"),
      ]);
      if (metaRes.ok) setMeta((await metaRes.json()).data);
      if (balanceRes.ok) setBalance((await balanceRes.json()).data);
      setLoading(false);
    })();

    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const prefs = JSON.parse(raw);
        // Syncing initial state from localStorage (an external store) on
        // mount is exactly the documented use case for this pattern.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (prefs.rate) setDefaultRate(String(prefs.rate));
        if (prefs.interval) setDefaultInterval(String(prefs.interval));
      }
    } catch {
      // ignore malformed/unavailable localStorage
    }
  }, []);

  function savePrefs() {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ rate: Number(defaultRate), interval: Number(defaultInterval) })
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // localStorage unavailable (private browsing, etc) -- silently no-op
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-ink-soft mt-1">Platform status and your session defaults.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-ink-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <>
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Server size={16} className="text-primary" />
              <h2 className="font-display font-semibold">Node status</h2>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-xs text-ink-faint mb-1">Lightning backend</p>
                <Badge tone={meta?.lightning_provider === "lnd" ? "accent" : "neutral"}>
                  {meta?.lightning_provider ?? "unknown"}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-ink-faint mb-1">Reachable</p>
                <Badge tone={meta?.node_reachable ? "success" : "danger"}>
                  {meta?.node_reachable ? "yes" : "no"}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-ink-faint mb-1">Max session duration</p>
                <p className="font-mono-num text-sm">{meta?.max_session_duration_seconds}s</p>
              </div>
              <div>
                <p className="text-xs text-ink-faint mb-1">Max sats per session</p>
                <p className="font-mono-num text-sm">{fmtSats(meta?.max_total_sats_per_session ?? 0)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={16} className="text-primary" />
              <h2 className="font-display font-semibold">Platform wallet balance</h2>
            </div>
            <p className="font-mono-num text-3xl font-semibold text-primary">
              {balance ? fmtSats(balance.balance_sats) : "—"}
              <span className="text-sm text-ink-faint font-sans ml-2">sats</span>
            </p>
            <p className="text-xs text-ink-faint mt-2">
              This is the platform&apos;s shared Lightning wallet that funds
              every session&apos;s payments — not a personal balance.
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sliders size={16} className="text-primary" />
              <h2 className="font-display font-semibold">Default session settings</h2>
            </div>
            <p className="text-xs text-ink-faint mb-4">
              Saved locally in your browser only — these just pre-fill the
              start-session form, they&apos;re not sent anywhere until you
              actually start a session.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-ink-faint mb-1.5 block">Default rate (sats/tick)</label>
                <input
                  type="number"
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-line bg-canvas-alt text-sm font-mono-num focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-ink-faint mb-1.5 block">Default interval (seconds)</label>
                <input
                  type="number"
                  value={defaultInterval}
                  onChange={(e) => setDefaultInterval(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-line bg-canvas-alt text-sm font-mono-num focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={savePrefs}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              {saved ? <CheckCircle2 size={14} /> : null}
              {saved ? "Saved" : "Save defaults"}
            </button>
          </Card>
        </>
      )}
    </div>
  );
}
