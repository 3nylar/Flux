import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { getLightningProvider } from "../providers/index.js";
import { KeysendPaymentError } from "../providers/LightningProvider.js";
import { ApiError } from "../lib/errors.js";
import { emitEvent } from "./webhooks.js";
import type { Session } from "@prisma/client";

/**
 * The meter engine is a taxi meter, not a wallet: it fires one keysend
 * payment per tick interval for as long as a session is RUNNING, and stops
 * the instant it's told to -- guaranteeing no further payment is ever sent
 * after a stop is acknowledged.
 *
 * Design choices worth calling out explicitly:
 *
 *  - SCHEDULING: drift-free setTimeout chains, one per active session, kept
 *    in the `timers` map below. Each tick schedules its own successor based
 *    on elapsed wall-clock time rather than a naive setInterval, so a slow
 *    payment doesn't cause the meter to silently run fast or slow over a
 *    long session.
 *
 *  - RACE SAFETY: every tick re-reads the session's `state` from the
 *    database immediately before sending a payment. A stop that lands a
 *    millisecond before a scheduled tick fires will be seen by that check,
 *    so "stop" and "tick" can never race into a payment being sent after
 *    the user asked to stop.
 *
 *  - RESTART SAFETY: on boot, `reconcileOnStartup` reloads every RUNNING
 *    session from the database and resumes its scheduler (or auto-stops it,
 *    if it's been silent long enough to be considered abandoned/orphaned --
 *    see STALE_SESSION_TIMEOUT_SECONDS). Nothing about correctness depends
 *    on the process staying up continuously.
 *
 *  - SERVER-ENFORCED CAPS: maxDurationSeconds and maxTotalSats are clamped
 *    server-side to the operator's configured ceilings regardless of what a
 *    client requests, so a compromised or buggy integrator can't cause
 *    unbounded spend.
 */

const timers = new Map<string, NodeJS.Timeout>();

export interface StartSessionParams {
  apiKeyId: string;
  externalUserId: string;
  receiverPubkey: string;
  ratePerTickSats: number;
  tickIntervalSeconds: number;
  maxDurationSeconds?: number;
  maxTotalSats?: number;
}

export async function startSession(params: StartSessionParams): Promise<Session> {
  if (!/^0[23][0-9a-fA-F]{64}$/.test(params.receiverPubkey)) {
    throw ApiError.badRequest(
      "receiver_pubkey must be a 33-byte compressed secp256k1 public key (66 hex chars, starting with 02 or 03)."
    );
  }
  if (params.ratePerTickSats < 1) {
    throw ApiError.unprocessable("rate_too_low", "rate_per_tick_sats must be at least 1.");
  }
  if (params.tickIntervalSeconds < env.MIN_TICK_INTERVAL_SECONDS) {
    throw ApiError.badRequest(
      `tick_interval_seconds must be at least ${env.MIN_TICK_INTERVAL_SECONDS}.`
    );
  }

  const maxDurationSeconds = Math.min(
    params.maxDurationSeconds ?? env.MAX_SESSION_DURATION_SECONDS,
    env.MAX_SESSION_DURATION_SECONDS
  );
  const maxTotalSats = Math.min(
    params.maxTotalSats ?? env.MAX_TOTAL_SATS_PER_SESSION,
    env.MAX_TOTAL_SATS_PER_SESSION
  );

  const session = await prisma.session.create({
    data: {
      apiKeyId: params.apiKeyId,
      externalUserId: params.externalUserId,
      receiverPubkey: params.receiverPubkey,
      ratePerTickSats: params.ratePerTickSats,
      tickIntervalSeconds: params.tickIntervalSeconds,
      maxDurationSeconds,
      maxTotalSats,
      state: "RUNNING",
      startedAt: new Date(),
      nextTickAt: new Date(),
    },
  });

  void emitEvent(params.apiKeyId, "session.started", { session_id: session.id });
  scheduleNextTick(session.id, 0);
  return session;
}

export async function stopSession(
  apiKeyId: string,
  sessionId: string,
  reason = "user_requested"
): Promise<Session> {
  const session = await prisma.session.findFirst({ where: { id: sessionId, apiKeyId } });
  if (!session) throw ApiError.notFound("session");

  if (session.state === "STOPPED" || session.state === "FAILED") {
    // Idempotent: stopping an already-stopped session just returns it.
    return session;
  }

  cancelTimer(sessionId);

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { state: "STOPPED", stoppedAt: new Date(), stopReason: reason },
  });

  void emitEvent(apiKeyId, "session.stopped", {
    session_id: sessionId,
    total_sats: updated.totalSats,
    reason,
  });
  return updated;
}

export async function getSession(apiKeyId: string, sessionId: string): Promise<Session> {
  const session = await prisma.session.findFirst({ where: { id: sessionId, apiKeyId } });
  if (!session) throw ApiError.notFound("session");
  return session;
}

export async function listSessions(
  apiKeyId: string,
  limit: number,
  offset: number
): Promise<{ sessions: Session[]; total: number }> {
  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where: { apiKeyId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.session.count({ where: { apiKeyId } }),
  ]);
  return { sessions, total };
}

// --- Scheduler internals --------------------------------------------------

function scheduleNextTick(sessionId: string, delayMs: number): void {
  cancelTimer(sessionId);
  const timer = setTimeout(() => {
    void runTick(sessionId);
  }, delayMs);
  timer.unref?.(); // never block process exit on a pending tick
  timers.set(sessionId, timer);
}

function cancelTimer(sessionId: string): void {
  const existing = timers.get(sessionId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(sessionId);
  }
}

async function runTick(sessionId: string): Promise<void> {
  // Re-read state immediately before acting -- this is the guard that makes
  // stop() and tick() race-safe (see module doc comment above).
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || (session.state !== "RUNNING" && session.state !== "DEGRADED")) {
    return; // stopped, failed, or deleted between scheduling and firing
  }

  // Safety ceilings, enforced every tick regardless of what was true at
  // session start (covers config changes / clock skew edge cases too).
  const elapsedSeconds = session.startedAt
    ? (Date.now() - session.startedAt.getTime()) / 1000
    : 0;
  if (elapsedSeconds >= session.maxDurationSeconds) {
    await autoStop(session, "max_duration_reached");
    return;
  }
  if (session.totalSats + session.ratePerTickSats > session.maxTotalSats) {
    await autoStop(session, "max_total_sats_reached");
    return;
  }

  const provider = getLightningProvider();

  try {
    const balance = await provider.getWalletBalanceSats();
    if (balance < session.ratePerTickSats) {
      await autoStop(session, "insufficient_wallet_balance");
      return;
    }

    const result = await provider.sendKeysend({
      destPubkey: session.receiverPubkey,
      amountSats: session.ratePerTickSats,
    });

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          sessionId: session.id,
          amountSats: session.ratePerTickSats,
          status: "SUCCEEDED",
          paymentHash: result.paymentHash,
          preimage: result.preimage,
          feeSats: result.feeSats,
          attemptedAt: new Date(),
        },
      }),
      prisma.session.update({
        where: { id: session.id },
        data: {
          totalSats: { increment: session.ratePerTickSats },
          consecutiveFailures: 0,
          state: "RUNNING",
          lastTickAt: new Date(),
          nextTickAt: new Date(Date.now() + session.tickIntervalSeconds * 1000),
        },
      }),
    ]);

    void emitEvent(session.apiKeyId, "payment.sent", {
      session_id: session.id,
      amount_sats: session.ratePerTickSats,
      payment_hash: result.paymentHash,
      total_sats: session.totalSats + session.ratePerTickSats,
    });

    scheduleNextTick(session.id, session.tickIntervalSeconds * 1000);
  } catch (err) {
    await handleTickFailure(session, err);
  }
}

async function handleTickFailure(session: Session, err: unknown): Promise<void> {
  const reason = err instanceof KeysendPaymentError ? err.message : "Unknown payment error.";

  await prisma.payment.create({
    data: {
      sessionId: session.id,
      amountSats: session.ratePerTickSats,
      status: "FAILED",
      failureReason: reason,
      attemptedAt: new Date(),
    },
  });

  const consecutiveFailures = session.consecutiveFailures + 1;
  void emitEvent(session.apiKeyId, "payment.failed", {
    session_id: session.id,
    reason,
    consecutive_failures: consecutiveFailures,
  });

  if (consecutiveFailures >= env.MAX_CONSECUTIVE_PAYMENT_FAILURES) {
    await autoStop(session, `payment_failures_exceeded: ${reason}`);
    return;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { state: "DEGRADED", consecutiveFailures },
  });

  // Retry with the same interval; a real deployment might back off
  // exponentially here, but a fixed retry keeps the meter's billing
  // cadence predictable for the integrator.
  scheduleNextTick(session.id, session.tickIntervalSeconds * 1000);
}

async function autoStop(session: Session, reason: string): Promise<void> {
  cancelTimer(session.id);
  await prisma.session.update({
    where: { id: session.id },
    data: { state: "FAILED", stoppedAt: new Date(), stopReason: reason },
  });
  void emitEvent(session.apiKeyId, "session.autostopped", {
    session_id: session.id,
    reason,
    total_sats: session.totalSats,
  });
}

/**
 * Resume every RUNNING/DEGRADED session on process boot. A session whose
 * next tick is further in the past than STALE_SESSION_TIMEOUT_SECONDS is
 * treated as orphaned (the process was down long enough that "continuing
 * to bill" would be a surprise to the integrator) and is auto-stopped
 * instead of resumed -- erring toward stopping billing rather than
 * silently continuing it after an outage.
 */
export async function reconcileOnStartup(): Promise<void> {
  const active = await prisma.session.findMany({
    where: { state: { in: ["RUNNING", "DEGRADED"] } },
  });

  for (const session of active) {
    const staleMs = session.nextTickAt
      ? Date.now() - session.nextTickAt.getTime()
      : Number.POSITIVE_INFINITY;

    if (staleMs > env.STALE_SESSION_TIMEOUT_SECONDS * 1000) {
      await autoStop(session, "orphaned_after_restart");
      continue;
    }

    const delay = session.nextTickAt
      ? Math.max(0, session.nextTickAt.getTime() - Date.now())
      : 0;
    scheduleNextTick(session.id, delay);
  }
}

/** Test-only: cancel every scheduled timer, for clean test teardown. */
export function __clearAllTimersForTests(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
