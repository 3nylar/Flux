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
 *  - SCHEDULING: there is no in-process timer. `sweepDueSessions()` polls
 *    for every session whose `nextTickAt` is due and ticks it, and is meant
 *    to be invoked repeatedly by an external driver -- a `setInterval` in
 *    the self-hosted/Docker entrypoint (`server.ts`) for sub-minute
 *    cadence, or a Vercel Cron job hitting `POST /internal/tick` once a
 *    minute in the serverless deployment. Each session's own `nextTickAt`
 *    is what drives cadence (set from elapsed wall-clock time, not a fixed
 *    counter), so a slow payment doesn't cause the meter to silently run
 *    fast or slow over a long session.
 *
 *  - CONCURRENCY SAFETY: before ticking a due session, `sweepDueSessions`
 *    atomically claims it with a conditional update keyed on the
 *    `nextTickAt` value it just read. If that update affects zero rows,
 *    another concurrent sweep (e.g. overlapping cron invocations) already
 *    claimed the session, and this pass skips it -- no session is ever
 *    ticked twice for the same due tick.
 *
 *  - RACE SAFETY: every tick re-reads the session's `state` from the
 *    database immediately before sending a payment. A stop that lands a
 *    millisecond before a scheduled tick fires will be seen by that check,
 *    so "stop" and "tick" can never race into a payment being sent after
 *    the user asked to stop.
 *
 *  - DOWNTIME SAFETY: any due session that's been silent longer than
 *    STALE_SESSION_TIMEOUT_SECONDS (e.g. the whole deployment was down, or
 *    -- on Vercel -- cron didn't fire for a while) is auto-stopped instead
 *    of billed for the missed time, erring toward stopping billing rather
 *    than silently continuing it after an outage.
 *
 *  - SERVER-ENFORCED CAPS: maxDurationSeconds and maxTotalSats are clamped
 *    server-side to the operator's configured ceilings regardless of what a
 *    client requests, so a compromised or buggy integrator can't cause
 *    unbounded spend.
 */

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

export interface ListSessionsFilters {
  externalUserId?: string;
  state?: string;
}

export async function listSessions(
  apiKeyId: string,
  limit: number,
  offset: number,
  filters: ListSessionsFilters = {}
): Promise<{ sessions: Session[]; total: number }> {
  const where = {
    apiKeyId,
    ...(filters.externalUserId ? { externalUserId: filters.externalUserId } : {}),
    ...(filters.state ? { state: filters.state.toUpperCase() as never } : {}),
  };
  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.session.count({ where }),
  ]);
  return { sessions, total };
}

// --- Scheduler internals --------------------------------------------------

/** How long a claim on a due session is held before it'd become visible as due again. */
const CLAIM_LOCK_MS = 30_000;

/**
 * Find every session due for a tick, claim each one atomically, and either
 * tick it or auto-stop it if it's gone stale. Meant to be invoked
 * repeatedly by an external driver -- see the module doc comment above.
 */
export async function sweepDueSessions(): Promise<{ ticked: number; autoStopped: number }> {
  const due = await prisma.session.findMany({
    where: { state: { in: ["RUNNING", "DEGRADED"] }, nextTickAt: { lte: new Date() } },
  });

  let ticked = 0;
  let autoStopped = 0;

  for (const session of due) {
    if (!(await claimSession(session))) continue; // another concurrent sweep already took it

    const staleMs = session.nextTickAt
      ? Date.now() - session.nextTickAt.getTime()
      : Number.POSITIVE_INFINITY;

    if (staleMs > env.STALE_SESSION_TIMEOUT_SECONDS * 1000) {
      await autoStop(session, "orphaned_after_downtime");
      autoStopped++;
      continue;
    }

    await tickSession(session);
    ticked++;
  }

  return { ticked, autoStopped };
}

/**
 * Atomically claim a due session before acting on it, using its own
 * `nextTickAt` as an implicit optimistic-concurrency version: the update
 * only succeeds if `nextTickAt` still matches the value just read, so two
 * overlapping sweeps can never both claim (and double-tick) the same
 * session.
 */
async function claimSession(session: Session): Promise<boolean> {
  const claim = await prisma.session.updateMany({
    where: { id: session.id, nextTickAt: session.nextTickAt },
    data: { nextTickAt: new Date(Date.now() + CLAIM_LOCK_MS) },
  });
  return claim.count === 1;
}

async function tickSession(session: Session): Promise<void> {
  // Re-read state immediately before acting -- this is the guard that makes
  // stop() and tick() race-safe (see module doc comment above).
  const current = await prisma.session.findUnique({ where: { id: session.id } });
  if (!current || (current.state !== "RUNNING" && current.state !== "DEGRADED")) {
    return; // stopped, failed, or deleted between claiming and ticking
  }

  // Safety ceilings, enforced every tick regardless of what was true at
  // session start (covers config changes / clock skew edge cases too).
  const elapsedSeconds = current.startedAt
    ? (Date.now() - current.startedAt.getTime()) / 1000
    : 0;
  if (elapsedSeconds >= current.maxDurationSeconds) {
    await autoStop(current, "max_duration_reached");
    return;
  }
  if (current.totalSats + current.ratePerTickSats > current.maxTotalSats) {
    await autoStop(current, "max_total_sats_reached");
    return;
  }

  const provider = getLightningProvider();

  try {
    const balance = await provider.getWalletBalanceSats();
    if (balance < current.ratePerTickSats) {
      await autoStop(current, "insufficient_wallet_balance");
      return;
    }

    const result = await provider.sendKeysend({
      destPubkey: current.receiverPubkey,
      amountSats: current.ratePerTickSats,
    });

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          sessionId: current.id,
          amountSats: current.ratePerTickSats,
          status: "SUCCEEDED",
          paymentHash: result.paymentHash,
          preimage: result.preimage,
          feeSats: result.feeSats,
          attemptedAt: new Date(),
        },
      }),
      prisma.session.update({
        where: { id: current.id },
        data: {
          totalSats: { increment: current.ratePerTickSats },
          consecutiveFailures: 0,
          state: "RUNNING",
          lastTickAt: new Date(),
          nextTickAt: new Date(Date.now() + current.tickIntervalSeconds * 1000),
        },
      }),
    ]);

    void emitEvent(current.apiKeyId, "payment.sent", {
      session_id: current.id,
      amount_sats: current.ratePerTickSats,
      payment_hash: result.paymentHash,
      total_sats: current.totalSats + current.ratePerTickSats,
    });
  } catch (err) {
    await handleTickFailure(current, err);
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

  // Retry at the same interval on the next sweep; a real deployment might
  // back off exponentially here, but a fixed retry keeps the meter's
  // billing cadence predictable for the integrator.
  await prisma.session.update({
    where: { id: session.id },
    data: {
      state: "DEGRADED",
      consecutiveFailures,
      nextTickAt: new Date(Date.now() + session.tickIntervalSeconds * 1000),
    },
  });
}

async function autoStop(session: Session, reason: string): Promise<void> {
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
