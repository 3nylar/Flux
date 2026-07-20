import type { Session, Payment } from "@prisma/client";

export interface SessionResource {
  id: string;
  external_user_id: string;
  receiver_pubkey: string;
  rate_per_tick_sats: number;
  tick_interval_seconds: number;
  max_duration_seconds: number;
  max_total_sats: number;
  state: string;
  total_sats: number;
  consecutive_failures: number;
  stop_reason: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

export function serializeSession(s: Session): SessionResource {
  return {
    id: s.id,
    external_user_id: s.externalUserId,
    receiver_pubkey: s.receiverPubkey,
    rate_per_tick_sats: s.ratePerTickSats,
    tick_interval_seconds: s.tickIntervalSeconds,
    max_duration_seconds: s.maxDurationSeconds,
    max_total_sats: s.maxTotalSats,
    state: s.state.toLowerCase(),
    total_sats: s.totalSats,
    consecutive_failures: s.consecutiveFailures,
    stop_reason: s.stopReason,
    started_at: s.startedAt?.toISOString() ?? null,
    stopped_at: s.stoppedAt?.toISOString() ?? null,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  };
}

export interface PaymentResource {
  id: string;
  amount_sats: number;
  status: string;
  payment_hash: string | null;
  fee_sats: number | null;
  failure_reason: string | null;
  attempted_at: string;
}

export function serializePayment(p: Payment): PaymentResource {
  return {
    id: p.id,
    amount_sats: p.amountSats,
    status: p.status.toLowerCase(),
    payment_hash: p.paymentHash,
    fee_sats: p.feeSats,
    failure_reason: p.failureReason,
    attempted_at: p.attemptedAt.toISOString(),
  };
}
