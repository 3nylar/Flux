# Flux — Streaming Sats

A taxi meter for money over the Lightning Network. Start a session, and
Flux fires one keysend payment per tick to a receiver for as long as it
runs. Stop it at any moment — billing halts within one tick, guaranteed,
because the server re-checks session state immediately before every
single payment.

This is Project 01 from the original three-project brief, built as a
fully documented, self-hostable API plus a real reference client — not
just a demo UI wired directly to a database.

```
api/   Fastify + TypeScript API — the actual product. Session state
       machine, pluggable Lightning backend, webhooks, OpenAPI docs.
web/   Next.js reference client — a live interactive demo that calls the
       API the way a real integration should (API key stays server-side).
```

## Why two folders

The API is designed to be genuinely reusable infrastructure — something
another developer deploys and integrates with, not just a backend for one
frontend. The reference client exists to prove that contract: it's a real,
separate application that only talks to the API over HTTP, the same way
any third-party integrator would.

## Quickstart

**1. Run the API** (see `api/README.md` for full detail):
```bash
cd api
npm install
docker compose up -d db
cp .env.example .env
npx prisma generate && npx prisma migrate deploy
npm run keys:create -- --name "Local dev"   # save the printed flx_test_... key
npm run dev
```
Now running on `http://localhost:8081`, on the **simulated** Lightning
backend by default — no real node required. Visit
`http://localhost:8081/docs` for the interactive API reference.

**2. Run the reference client:**
```bash
cd web
npm install
cp .env.example .env.local
# edit .env.local: paste the flx_test_... key from step 1 into FLUX_API_KEY
npm run dev
```
Now running on `http://localhost:3000` — click "Start streaming" and watch
a real session bill against the API you just started.

## What's actually implemented

- **The meter engine** — a race-safe session state machine with drift-free
  tick scheduling, server-enforced safety ceilings, a payment-failure
  circuit breaker, and restart-safe reconciliation on boot. 20 passing
  tests cover these guarantees directly, including "no payment is ever
  sent after stop" under real timing, not mocked time.
- **A pluggable Lightning backend** — ships with a fully working simulated
  provider (real preimage/hash generation, configurable failure rate) and
  a real LND REST provider built to LND's documented keysend contract.
- **A documented REST + WebSocket API** — interactive reference at
  `/docs`, API-key auth, idempotency on every write, signed webhooks,
  consistent error codes.
- **Reusable infrastructure** — Docker Compose brings up the whole backend
  with one command; `docs/EXTENDING.md` in the API folder maps out exactly
  where to plug in horizontal scaling, real pub/sub, and webhook retries.
- **A reference client that models correct integration** — the browser
  never sees the API key; `web/app/api/flux/*` are thin server-side proxy
  routes, the pattern any real product built on Flux should follow.

## Honest limitations

- `LndRestProvider` was built precisely to LND's documented REST API
  contract but has not been run against a live LND node in this build
  environment (none was reachable). `api/docs/LND_INTEGRATION.md` is both
  the setup guide (Polar regtest) and the verification checklist for
  closing that gap before trusting it with a node holding real funds.
- The scheduler is single-process (in-memory timers + Postgres as source
  of truth, reconciled on restart). It doesn't coordinate across multiple
  API processes yet — see `api/docs/EXTENDING.md` for the scaling path.
- Webhook delivery is single-attempt with no retry/backoff yet (every
  attempt is still logged, so nothing is silently lost).

See `api/README.md` for the full picture, including deployment
instructions, security notes, and the complete project structure.
