import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { fluxFetch, canAccessSession } from "@/lib/fluxServer";
import { Card } from "@/components/ui/Card";
import { StateBadge } from "@/components/dashboard/StateBadge";
import { fmtSats, fmtDate } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

interface SessionDetail {
  id: string;
  state: string;
  total_sats: number;
  rate_per_tick_sats: number;
  tick_interval_seconds: number;
  max_duration_seconds: number;
  max_total_sats: number;
  receiver_pubkey: string;
  external_user_id: string;
  stop_reason: string | null;
  started_at: string | null;
  stopped_at: string | null;
}

interface PaymentRow {
  id: string;
  amount_sats: number;
  status: string;
  payment_hash: string | null;
  fee_sats: number | null;
  failure_reason: string | null;
  attempted_at: string;
}

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authSession = await auth();
  const userId = (authSession?.user as { id?: string } | undefined)?.id ?? null;

  let session: SessionDetail;
  let payments: PaymentRow[] = [];
  try {
    const sessionResult = (await fluxFetch(`/v1/sessions/${id}`)) as { data: SessionDetail };
    session = sessionResult.data;
    if (!canAccessSession(session.external_user_id, userId)) {
      notFound();
    }
    const paymentsResult = (await fluxFetch(`/v1/sessions/${id}/payments?limit=100`)) as {
      data: PaymentRow[];
    };
    payments = paymentsResult.data;
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/dashboard/sessions" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink transition-colors">
        <ArrowLeft size={14} /> Back to history
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-faint font-mono-num mb-1">{session.id}</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Session receipt</h1>
        </div>
        <StateBadge state={session.state} />
      </div>

      <Card className="p-6 grid grid-cols-2 gap-6">
        <Field label="Total sats streamed" value={fmtSats(session.total_sats)} mono />
        <Field label="Rate" value={`${session.rate_per_tick_sats} sats / ${session.tick_interval_seconds}s`} mono />
        <Field label="Receiver pubkey" value={session.receiver_pubkey} mono truncate />
        <Field label="Stop reason" value={session.stop_reason?.replace(/_/g, " ") ?? "—"} />
        <Field label="Started" value={fmtDate(session.started_at)} />
        <Field label="Stopped" value={fmtDate(session.stopped_at)} />
        <Field label="Max duration" value={`${session.max_duration_seconds}s`} mono />
        <Field label="Max total sats" value={fmtSats(session.max_total_sats)} mono />
      </Card>

      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Payment history</h2>
        {payments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft text-sm">
            No payments were recorded for this session.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas-alt text-ink-faint text-xs">
                  <th className="text-left font-medium px-4 py-3">Time</th>
                  <th className="text-right font-medium px-4 py-3">Amount</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Payment hash</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3 text-ink-soft">{fmtDate(p.attempted_at)}</td>
                    <td className="px-4 py-3 text-right font-mono-num">{fmtSats(p.amount_sats)}</td>
                    <td className="px-4 py-3">
                      <StateBadge state={p.status} />
                    </td>
                    <td className="px-4 py-3 font-mono-num text-xs text-ink-faint">
                      {p.payment_hash ? `${p.payment_hash.slice(0, 16)}...` : p.failure_reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono, truncate }: { label: string; value: string; mono?: boolean; truncate?: boolean }) {
  return (
    <div>
      <p className="text-xs text-ink-faint mb-1">{label}</p>
      <p className={`text-sm ${mono ? "font-mono-num" : ""} ${truncate ? "truncate" : ""}`}>{value}</p>
    </div>
  );
}
