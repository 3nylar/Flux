# Flux — Streaming Sats API

A taxi meter for money over the Lightning Network. Start a session, and
Flux fires one keysend payment per tick to a receiver for as long as it
runs. Stop it at any moment — billing halts within one tick, guaranteed.

This is the API-and-infrastructure build of Project 01 from the original
three-project brief: a fully documented, self-hostable REST + WebSocket API
with API-key auth, idempotency, webhooks, and a pluggable Lightning
backend — designed so another developer can deploy it, integrate it, and
extend it without touching the core engine.

## What's actually implemented

- **The meter engine** (`src/services/meterEngine.ts`) — a race-safe
  session state machine with drift-free tick scheduling, server-enforced
  safety ceilings (max duration, max total sats), a payment-failure circuit
  breaker, and a downtime-safe due-session sweep (auto-stops anything
  silent longer than `STALE_SESSION_TIMEOUT_SECONDS` instead of billing
  through the gap). **23 passing tests** cover every one of these
  guarantees, including "no payment is ever sent after stop" and no
  session ever billed twice for one due tick under concurrent sweeps.
- **A pluggable Lightning backend** (`src/providers/`) — ships with a fully
  working `SimulatedLightningProvider` (zero infrastructure required, real
  preimage/hash generation, configurable latency and failure rate for
  testing the circuit breaker) and an `LndRestProvider` built to LND's
  documented REST/keysend contract for real payments. See
  `docs/LND_INTEGRATION.md` for the honest status of that second one — it
  hasn't been run against a live node in this build environment, and that
  doc is both the setup guide and the verification checklist.
- **A documented REST + WebSocket API** — `GET /docs` serves an interactive
  reference (Scalar, rendered from `docs/openapi.yaml`), the same pattern
  as the companion Auctra API project. API-key auth, `Idempotency-Key`
  support on every write, consistent error codes, and outbound webhooks
  (`session.started`, `payment.sent`, `payment.failed`, `session.stopped`,
  `session.autostopped`), HMAC-signed the same way Stripe/GitHub sign
  theirs.
- **Reusable infrastructure** — a `Dockerfile` and `docker-compose.yml`
  that bring up Postgres + the API with one command, a CLI for issuing API
  keys, and `docs/EXTENDING.md` mapping out exactly where to plug in
  horizontal scaling, real pub/sub, and webhook retries when you outgrow
  the reference architecture.

## Quickstart

```bash
git clone <this repo> flux && cd flux
npm install
docker compose up -d db
cp .env.example .env          # defaults already point at the docker-compose db
npx prisma generate
npx prisma migrate deploy
npm run keys:create -- --name "My first key"   # prints a flx_test_... key, save it
npm run dev
```

The API is now listening on `http://localhost:8081`, running entirely on
the **simulated** Lightning provider — no real node required. Visit
`http://localhost:8081/docs` for the interactive reference.

### Start a session

```bash
curl -X POST http://localhost:8081/v1/sessions \
  -H "Authorization: Bearer flx_test_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "external_user_id": "user_123",
    "receiver_pubkey": "02f6725f9c1c40333b67faea92fd211c183050f28df32cbaab5d5644b1e50496a",
    "rate_per_tick_sats": 10,
    "tick_interval_seconds": 5
  }'
```

Watch it bill:

```bash
curl http://localhost:8081/v1/sessions/<id> -H "Authorization: Bearer flx_test_..."
```

Stop it:

```bash
curl -X POST http://localhost:8081/v1/sessions/<id>/stop \
  -H "Authorization: Bearer flx_test_..."
```

## Going live with real Lightning payments

1. Get a real (or Polar regtest) LND node — see `docs/LND_INTEGRATION.md`.
2. Set `LIGHTNING_PROVIDER=lnd`, `LND_REST_URL`, `LND_MACAROON_HEX`, and
   optionally `LND_TLS_CERT_BASE64` in your environment.
3. Work through the verification checklist in that same document before
   trusting it with a node holding real funds.

## Deploying

**Docker (recommended):**
```bash
docker compose up -d
```
This builds the API image, brings up Postgres, and runs migrations
automatically (see the `api` service's `command` in `docker-compose.yml`).
Set `LIGHTNING_PROVIDER`, `LND_*`, and `PUBLIC_BASE_URL` as environment
variables before running, or in a `.env` file docker-compose will pick up
automatically.

**Any Node host (Railway, Render, Fly.io, a VPS):** build with
`npm run build`, run with `npm start`, provide a real Postgres
`DATABASE_URL`, and run `npx prisma migrate deploy` once before first
boot (or as a release-phase command, if your host supports one). These
deployments keep the exact behavior described above: sub-minute ticking
via an in-process interval, and the live WebSocket stream.

**Vercel:** the API is re-architected for serverless here (`index.ts` +
`vercel.json`), with two real behavior changes from the Docker/Node-host
path — see "Known simplifications" below. Steps:

1. Provision a Postgres database that supports both a pooled and an
   unpooled connection string (e.g. Vercel Postgres / Neon) and set
   `DATABASE_URL` (pooled) and `DIRECT_URL` (unpooled — Prisma Migrate
   needs it) in the Vercel project's env vars.
2. Provision a Redis instance (e.g. Upstash, via Vercel's marketplace) and
   set `REDIS_URL`, so rate limiting works correctly across serverless
   instances instead of falling back to a per-process in-memory store.
3. Set `CRON_SECRET` (16+ random characters) — Vercel sends it back as
   `Authorization: Bearer $CRON_SECRET` when it invokes the cron job
   defined in `vercel.json` (`POST /internal/tick`, once a minute), which
   is what drives billing ticks in place of the in-process interval.
4. Set `ENABLE_WEBSOCKET_STREAM=false` and `MIN_TICK_INTERVAL_SECONDS=60`
   (see below for why).
5. Set the rest of the usual vars (`LIGHTNING_PROVIDER`, `PUBLIC_BASE_URL`
   to the deployed URL, etc.), then deploy. `vercel.json`'s `buildCommand`
   runs `prisma generate` and `prisma migrate deploy` for you.
6. Mint the first API key by pulling the production `DATABASE_URL` locally
   (`vercel env pull`) and running `npm run keys:create` once.

## Security notes

- API keys are stored as SHA-256 hashes only; the raw key is shown once at
  creation (`npm run keys:create`) and never persisted.
- Webhook payloads are HMAC-SHA256 signed with a per-webhook secret (shown
  once at creation) in a `Flux-Signature: sha256=...` header — verify it
  the same way you'd verify a Stripe webhook.
- `Idempotency-Key` support on every write endpoint means a client that
  times out and retries a `POST /v1/sessions` call can never accidentally
  start a second billing session for the same request.
- Every safety ceiling (max session duration, max total sats, minimum tick
  interval) is enforced **server-side**, clamped to the operator's
  configured limits regardless of what a client requests.

## Project structure

```
src/
  config/env.ts              validated environment configuration
  lib/errors.ts               consistent API error model
  lib/apiKeys.ts, prisma.ts   shared infrastructure
  middleware/auth.ts           API-key authentication
  middleware/idempotency.ts    safe retries for write endpoints
  providers/                   pluggable Lightning backends
    LightningProvider.ts        the interface everything else depends on
    SimulatedLightningProvider  default, zero-infrastructure backend
    LndRestProvider              real keysend via LND's REST API
  services/
    meterEngine.ts               the core: session state machine + scheduler
    webhooks.ts                  signed webhook dispatch
    serializers.ts               DB row -> public JSON shape
  routes/                       sessions, webhooks, meta, docs
  schemas/requests.ts           zod request validation
  scripts/createApiKey.ts       CLI for issuing keys
docs/
  openapi.yaml                  the API reference's source of truth
  LND_INTEGRATION.md            real-node setup + verification checklist
  EXTENDING.md                  where to plug in scaling / pub-sub / retries
  TESTING.md                    how to actually verify all of this
test/
  meterEngine.test.ts            23 tests covering the core guarantees
  fakePrisma.ts                  in-memory test double, not a real DB
prisma/schema.prisma
docker-compose.yml
Dockerfile
```

## Known simplifications (documented, not accidental)

- **Polling scheduler, not pub/sub.** `sweepDueSessions()` (in
  `src/services/meterEngine.ts`) finds every session due for a tick and
  bills it, driven by a plain `setInterval` on Docker/Node hosts (sub-second
  polling) or by Vercel Cron on the serverless deployment (once a minute,
  Vercel Cron's minimum granularity). Either way it needs nothing but
  Postgres and is downtime-safe: a session silent longer than
  `STALE_SESSION_TIMEOUT_SECONDS` is auto-stopped instead of billed for the
  gap. See `docs/EXTENDING.md` for the BullMQ upgrade path if you need
  true sub-second billing across multiple coordinating processes.
- **On Vercel specifically, tick granularity is capped at ~60s.** Set
  `MIN_TICK_INTERVAL_SECONDS=60` there (the local/Docker default stays 1)
  — Vercel Cron can't fire more often than once a minute, so a faster
  configured interval would just mean a session accumulates multiple due
  ticks between cron runs rather than billing precisely on schedule.
- **On Vercel specifically, the WebSocket stream is unavailable.**
  Serverless functions can't hold a persistent connection, so
  `ENABLE_WEBSOCKET_STREAM=false` there and `GET /v1/sessions/{id}/stream`
  returns `501`. Poll `GET /v1/sessions/{id}` instead — this is the only
  behavior difference the reference `web/` dashboard cares about, and it
  already does exactly that (see `web/lib/fluxServer.ts`).
- **Webhook delivery is single-attempt.** Every attempt is logged
  (`WebhookDelivery`), so nothing is silently lost, but there's no
  retry/backoff yet.
- **`LndRestProvider` is unverified against a live node** in this build
  environment specifically (no Lightning node was reachable in it). It's
  built precisely to LND's documented contract, and `docs/LND_INTEGRATION.md`
  is the checklist for closing that gap in your own environment.
