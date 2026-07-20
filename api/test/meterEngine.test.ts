import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakePrisma } from "./fakePrisma.js";

const fakePrisma = createFakePrisma();

vi.mock("../src/lib/prisma.js", () => ({ prisma: fakePrisma }));

const { startSession, stopSession, getSession, listSessions, sweepDueSessions } =
  await import("../src/services/meterEngine.js");
const { __setLightningProviderForTests } = await import("../src/providers/index.js");
const { SimulatedLightningProvider } = await import(
  "../src/providers/SimulatedLightningProvider.js"
);

const API_KEY_ID = "key_1";
const VALID_PUBKEY = "02" + "ab".repeat(32);

/** Force a session's next tick into the past, as if its interval had elapsed. */
async function forceDue(sessionId: string): Promise<void> {
  await fakePrisma.session.update({
    where: { id: sessionId },
    data: { nextTickAt: new Date(Date.now() - 10) },
  });
}

beforeEach(() => {
  fakePrisma.session._rows.length = 0;
  fakePrisma.payment._rows.length = 0;
  fakePrisma.webhook._rows.length = 0;
  __setLightningProviderForTests(
    new SimulatedLightningProvider({ failureRate: 0, latencyMs: 1 })
  );
});

describe("startSession", () => {
  it("creates a RUNNING session, due for a tick immediately", async () => {
    const session = await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "user_1",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 1,
    });

    expect(session.state).toBe("RUNNING");
    expect(session.totalSats).toBe(0);

    await sweepDueSessions();

    const updated = await getSession(API_KEY_ID, session.id);
    expect(updated.totalSats).toBe(10);
    expect(fakePrisma.payment._rows).toHaveLength(1);
    expect(fakePrisma.payment._rows[0]!.status).toBe("SUCCEEDED");
  });

  it("rejects a malformed receiver pubkey before creating any session", async () => {
    await expect(
      startSession({
        apiKeyId: API_KEY_ID,
        externalUserId: "user_1",
        receiverPubkey: "not-a-pubkey",
        ratePerTickSats: 10,
        tickIntervalSeconds: 1,
      })
    ).rejects.toThrow();
    expect(fakePrisma.session._rows).toHaveLength(0);
  });

  it("clamps client-requested caps to the server-configured maximums", async () => {
    const session = await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "user_1",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 1,
      maxDurationSeconds: 999_999_999, // absurdly large
      maxTotalSats: 999_999_999,
    });
    // test/setup.ts sets MAX_SESSION_DURATION_SECONDS=3600, MAX_TOTAL_SATS_PER_SESSION=100000
    expect(session.maxDurationSeconds).toBe(3600);
    expect(session.maxTotalSats).toBe(100_000);
  });
});

describe("stopSession", () => {
  it("stops billing immediately -- no payment is sent after stop", async () => {
    const session = await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "user_1",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 1,
    });

    // Stop before any sweep has a chance to tick it.
    const stopped = await stopSession(API_KEY_ID, session.id);
    expect(stopped.state).toBe("STOPPED");

    // A sweep now (or any number of them) must never bill a stopped session,
    // even though it was due at the moment it was stopped.
    await sweepDueSessions();
    await sweepDueSessions();

    const final = await getSession(API_KEY_ID, session.id);
    expect(final.totalSats).toBe(0);
    expect(fakePrisma.payment._rows).toHaveLength(0);
  });

  it("is idempotent -- stopping an already-stopped session just returns it", async () => {
    const session = await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "user_1",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 1,
    });
    await stopSession(API_KEY_ID, session.id);
    const secondStop = await stopSession(API_KEY_ID, session.id);
    expect(secondStop.state).toBe("STOPPED");
  });

  it("stops a session that has already been running and billing", async () => {
    const session = await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "user_1",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 1,
    });
    await sweepDueSessions(); // let the first tick land
    await stopSession(API_KEY_ID, session.id);
    const totalAtStop = (await getSession(API_KEY_ID, session.id)).totalSats;
    expect(totalAtStop).toBeGreaterThan(0);

    // Simulate a second interval having elapsed, then sweep again -- a
    // stopped session is excluded from the due query regardless.
    await forceDue(session.id);
    await sweepDueSessions();
    const final = await getSession(API_KEY_ID, session.id);
    expect(final.totalSats).toBe(totalAtStop); // unchanged after stop
  });
});

describe("safety ceilings", () => {
  it("auto-stops once maxTotalSats would be exceeded by the next tick", async () => {
    const session = await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "user_1",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 40,
      tickIntervalSeconds: 1,
      maxTotalSats: 100, // allows at most 2 ticks (40 + 40 = 80; a 3rd would hit 120 > 100)
    });

    let final = await getSession(API_KEY_ID, session.id);
    for (let i = 0; i < 5 && final.state !== "FAILED"; i++) {
      await forceDue(session.id);
      await sweepDueSessions();
      final = await getSession(API_KEY_ID, session.id);
    }

    expect(final.state).toBe("FAILED");
    expect(final.stopReason).toBe("max_total_sats_reached");
    expect(final.totalSats).toBeLessThanOrEqual(100);
  });

  it("auto-stops once maxDurationSeconds has elapsed", async () => {
    const session = await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "user_1",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 1,
      tickIntervalSeconds: 1,
      maxDurationSeconds: 1,
    });

    // Simulate the session having started 2 seconds ago rather than
    // actually waiting for real time to pass.
    await fakePrisma.session.update({
      where: { id: session.id },
      data: { startedAt: new Date(Date.now() - 2000) },
    });
    await sweepDueSessions();

    const final = await getSession(API_KEY_ID, session.id);
    expect(final.state).toBe("FAILED");
    expect(final.stopReason).toBe("max_duration_reached");
  });
});

describe("payment failure handling (circuit breaker)", () => {
  it("auto-stops after MAX_CONSECUTIVE_PAYMENT_FAILURES consecutive failures", async () => {
    __setLightningProviderForTests(
      new SimulatedLightningProvider({ failureRate: 1, latencyMs: 1 }) // always fails
    );

    const session = await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "user_1",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 1,
    });

    // test/setup.ts sets MAX_CONSECUTIVE_PAYMENT_FAILURES=3
    let final = await getSession(API_KEY_ID, session.id);
    for (let i = 0; i < 5 && final.state !== "FAILED"; i++) {
      await forceDue(session.id);
      await sweepDueSessions();
      final = await getSession(API_KEY_ID, session.id);
    }

    expect(final.state).toBe("FAILED");
    expect(final.stopReason).toContain("payment_failures_exceeded");
    expect(final.totalSats).toBe(0); // no successful payments were ever recorded
    const failedPayments = fakePrisma.payment._rows.filter((p) => p.status === "FAILED");
    expect(failedPayments.length).toBeGreaterThanOrEqual(3);
  });
});

describe("listSessions filtering", () => {
  it("filters by externalUserId -- required for a multi-tenant app sharing one API key", async () => {
    await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "alice",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 100, // long enough that no tick fires during the test
    });
    await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "bob",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 100,
    });

    const { sessions: aliceSessions, total: aliceTotal } = await listSessions(
      API_KEY_ID,
      20,
      0,
      { externalUserId: "alice" }
    );
    expect(aliceTotal).toBe(1);
    expect(aliceSessions).toHaveLength(1);
    expect(aliceSessions[0]!.externalUserId).toBe("alice");

    const { total: allTotal } = await listSessions(API_KEY_ID, 20, 0);
    expect(allTotal).toBe(2);
  });

  it("filters by state", async () => {
    const s1 = await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "carol",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 100,
    });
    await stopSession(API_KEY_ID, s1.id);
    await startSession({
      apiKeyId: API_KEY_ID,
      externalUserId: "carol",
      receiverPubkey: VALID_PUBKEY,
      ratePerTickSats: 10,
      tickIntervalSeconds: 100,
    });

    const { sessions: running } = await listSessions(API_KEY_ID, 20, 0, { state: "running" });
    const { sessions: stopped } = await listSessions(API_KEY_ID, 20, 0, { state: "stopped" });
    expect(running.every((s) => s.state === "RUNNING")).toBe(true);
    expect(stopped.every((s) => s.state === "STOPPED")).toBe(true);
  });
});

describe("sweepDueSessions", () => {
  it("ticks a RUNNING session whose next tick is recent", async () => {
    const row = await fakePrisma.session.create({
      data: {
        apiKeyId: API_KEY_ID,
        externalUserId: "user_1",
        receiverPubkey: VALID_PUBKEY,
        ratePerTickSats: 10,
        tickIntervalSeconds: 1,
        maxDurationSeconds: 3600,
        maxTotalSats: 100_000,
        state: "RUNNING",
        totalSats: 0,
        consecutiveFailures: 0,
        startedAt: new Date(),
        nextTickAt: new Date(Date.now() - 500), // slightly overdue, well within stale threshold
      },
    });

    const result = await sweepDueSessions();

    expect(result.ticked).toBe(1);
    expect(result.autoStopped).toBe(0);
    const after = await getSession(API_KEY_ID, row.id as string);
    expect(after.state).toBe("RUNNING");
    expect(after.totalSats).toBeGreaterThan(0);
  });

  it("auto-stops a RUNNING session that's been silent longer than the stale threshold", async () => {
    // test/setup.ts sets STALE_SESSION_TIMEOUT_SECONDS=120
    const row = await fakePrisma.session.create({
      data: {
        apiKeyId: API_KEY_ID,
        externalUserId: "user_1",
        receiverPubkey: VALID_PUBKEY,
        ratePerTickSats: 10,
        tickIntervalSeconds: 1,
        maxDurationSeconds: 3600,
        maxTotalSats: 100_000,
        state: "RUNNING",
        totalSats: 50,
        consecutiveFailures: 0,
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        nextTickAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes overdue
      },
    });

    const result = await sweepDueSessions();

    expect(result.ticked).toBe(0);
    expect(result.autoStopped).toBe(1);
    const after = await getSession(API_KEY_ID, row.id as string);
    expect(after.state).toBe("FAILED");
    expect(after.stopReason).toBe("orphaned_after_downtime");
  });

  it("never ticks the same due session twice for one due tick, even if claimed concurrently", async () => {
    const row = await fakePrisma.session.create({
      data: {
        apiKeyId: API_KEY_ID,
        externalUserId: "user_1",
        receiverPubkey: VALID_PUBKEY,
        ratePerTickSats: 10,
        tickIntervalSeconds: 1,
        maxDurationSeconds: 3600,
        maxTotalSats: 100_000,
        state: "RUNNING",
        totalSats: 0,
        consecutiveFailures: 0,
        startedAt: new Date(),
        nextTickAt: new Date(Date.now() - 500),
      },
    });

    // Two overlapping sweeps racing over the same due session.
    await Promise.all([sweepDueSessions(), sweepDueSessions()]);

    const after = await getSession(API_KEY_ID, row.id as string);
    expect(after.totalSats).toBe(10); // billed exactly once, not twice
    expect(fakePrisma.payment._rows).toHaveLength(1);
  });
});
