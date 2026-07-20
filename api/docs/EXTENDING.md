# Extending Flux

Flux is built with a few deliberate seams so you can adapt it without
forking the core logic. This is a map of where to look.

## Swap the Lightning backend

Everything the meter engine knows about Lightning goes through
`LightningProvider` (`src/providers/LightningProvider.ts`):

```ts
interface LightningProvider {
  sendKeysend(params: { destPubkey: string; amountSats: number }): Promise<KeysendResult>;
  getWalletBalanceSats(): Promise<number>;
  readonly name: string;
}
```

To add a new backend (Core Lightning via `commando`, a multi-node router, a
different node's REST/gRPC API), implement this interface in a new file
under `src/providers/`, then wire it into `src/providers/index.ts`'s
`getLightningProvider()` factory. Nothing in `meterEngine.ts` or the routes
needs to change.

## Scale the scheduler past a single process

The reference scheduler (`src/services/meterEngine.ts`) uses in-process
`setTimeout` chains keyed by session ID, with Postgres as the durable
source of truth. This is intentionally simple -- it needs nothing but
Postgres, and `reconcileOnStartup()` makes it safe across restarts. It does
**not** coordinate across multiple API instances: if you run more than one
process, each would try to schedule ticks for the same sessions.

To scale horizontally:

1. Introduce a job queue (BullMQ + Redis is a natural fit, matching the
   PRD's original scaling path) and move tick scheduling into queued jobs
   instead of in-memory timers.
2. Use the queue's own locking/dedup features (e.g. BullMQ's job IDs) in
   place of the `timers` Map.
3. `reconcileOnStartup()` becomes unnecessary -- the queue itself survives
   restarts.

## Add a real pub/sub layer for /stream

The WebSocket endpoint (`GET /v1/sessions/:id/stream`) currently
poll-and-diffs the database every second per connected client, to keep the
reference implementation dependency-free. At meaningful scale, replace the
`setInterval` polling loop in `src/routes/sessions.ts` with a subscription
to whatever emits session-changed events in your deployment (Postgres
LISTEN/NOTIFY, a Redis pub/sub channel, or the same queue from the point
above).

## Harden webhook delivery

`src/services/webhooks.ts` delivers webhooks fire-and-forget with a single
attempt and no retry/backoff -- every attempt is still logged to
`WebhookDelivery` either way, so nothing is silently lost, but a
transiently-down endpoint will miss events. For production-grade delivery
guarantees, move dispatch into the same job queue you'd add for scheduling,
with exponential backoff and a dead-letter path after N failed attempts.

## Multi-tenant node routing

Flux currently sends every payment from a single configured Lightning
wallet. If you need different integrators (different API keys) to pay from
different wallets/nodes, the natural extension point is
`getLightningProvider()` -- change its signature to accept an API key (or
look one up per request) and return a provider instance bound to that
tenant's node credentials, stored the same way custodial keys are handled
in the companion Auctra API project (encrypted at rest, decrypted only
transiently in memory).

## Where the safety-critical logic lives

If you're auditing or modifying this codebase, the highest-value place to
spend review time is `src/services/meterEngine.ts` -- specifically:

- the state re-check at the top of `runTick()` (the race-safety guarantee
  that a stop can never be followed by a payment),
- `handleTickFailure()` and the circuit breaker threshold,
- the safety-ceiling checks (`maxDurationSeconds`, `maxTotalSats`) that run
  on every tick, not just at session start.

The test suite in `test/meterEngine.test.ts` exists specifically to pin
down these guarantees; any change to this file should come with a test
that would have failed before the change.
