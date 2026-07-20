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
  breaker, and restart-safe reconciliation on boot. **20 passing tests**
  cover every one of these guarantees, including "no payment is ever sent
  after stop" under realistic timing.
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
boot (or as a release-phase command, if your host supports one).

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
  meterEngine.test.ts            20 tests covering the core guarantees
  fakePrisma.ts                  in-memory test double, not a real DB
prisma/schema.prisma
docker-compose.yml
Dockerfile
```

## Known simplifications (documented, not accidental)

- **Single-process scheduler.** Ticks are scheduled with in-process
  timers, keyed by session ID, reconciled on boot from Postgres. This
  needs nothing but Postgres and is restart-safe, but doesn't coordinate
  across multiple API processes. See `docs/EXTENDING.md` for the BullMQ
  upgrade path.
- **Webhook delivery is single-attempt.** Every attempt is logged
  (`WebhookDelivery`), so nothing is silently lost, but there's no
  retry/backoff yet.
- **`LndRestProvider` is unverified against a live node** in this build
  environment specifically (no Lightning node was reachable in it). It's
  built precisely to LND's documented contract, and `docs/LND_INTEGRATION.md`
  is the checklist for closing that gap in your own environment.
