# Flux — Streaming Sats

A taxi meter for money over the Lightning Network. Start a session, and
Flux fires one keysend payment per tick to a receiver for as long as it
runs. Stop it at any moment — billing halts within one tick, guaranteed,
because the server re-checks session state immediately before every
single payment.

This is Project 01 from the original three-project brief, built as a
fully documented, self-hostable API plus a complete reference app — sign
in, start sessions, watch them bill live, review full history, check
platform status — not just a demo widget wired directly to a database.

```
api/   Fastify + TypeScript API — the actual product. Session state
       machine, pluggable Lightning backend, webhooks, OpenAPI docs.
web/   Next.js app — full account system (email sign-in), a dashboard
       with live sessions, history, receipts, and platform settings, all
       built as a real client of the API over HTTP.
```

## Why two folders, two databases

The API is designed to be genuinely reusable infrastructure — something
another developer deploys and integrates with, not just a backend for one
frontend. The web app proves that contract by being a real, separate
client: it has its own user accounts and its own database (for
sign-in only), and talks to the Flux API purely over HTTP with one shared
platform API key, exactly like any third-party integrator would. A
session's `external_user_id` is what ties a web app account to "their"
sessions in the API — the API itself has no idea the web app's accounts
exist.

## Quickstart

**1. Run the API** (see `api/README.md` for full detail, including every
environment variable):
```bash
cd api
npm install
docker compose up -d db
# create .env with at least DATABASE_URL and DIRECT_URL pointing at the
# docker-compose db (postgresql://flux:flux@localhost:5433/flux for both);
# see api/README.md's "Deploying" section for the full variable list.
npx prisma generate && npx prisma migrate deploy
npm run keys:create -- --name "Local dev"   # save the printed flx_test_... key
npm run dev
```
Now running on `http://localhost:8081`, on the **simulated** Lightning
backend by default — no real node required. Visit
`http://localhost:8081/docs` for the interactive API reference.

**2. Run the web app** (its own separate Postgres, for its own accounts):
```bash
cd web
npm install
docker compose up -d db
cp .env.example .env.local
# edit .env.local:
#   - FLUX_API_KEY: the flx_test_... key from step 1
#   - AUTH_SECRET: generate with `npx auth secret`
#   - EMAIL_SERVER_*: your SMTP credentials (magic-link sign-in)
npx prisma generate && npx prisma migrate deploy
npm run dev
```
Now running on `http://localhost:3000`. The homepage demo widget works
immediately with no account. Sign in to unlock `/dashboard` — start a
session there and it's saved to your real history.

## What's actually implemented

- **The meter engine** — a race-safe session state machine with drift-free
  tick scheduling, server-enforced safety ceilings, a payment-failure
  circuit breaker, and downtime-safe recovery (a sweep that either resumes
  or auto-stops a session, whichever a gap in ticking calls for). 23
  passing tests cover these guarantees directly, including "no payment is
  ever sent after stop" and never double-billing a session under
  concurrent scheduling, plus per-user session filtering.
- **A pluggable Lightning backend** — ships with a fully working simulated
  provider (real preimage/hash generation, configurable failure rate) and
  a real LND REST provider built to LND's documented keysend contract.
- **A documented REST + WebSocket API** — interactive reference at
  `/docs`, API-key auth, idempotency on every write, signed webhooks,
  consistent error codes, per-user filtering for multi-tenant integrations.
- **A full account system** — email magic-link sign-in (no wallet: Flux
  pays *out* from the platform's own wallet, so there's nothing for an
  end-user to connect), with dashboard, session history with CSV export,
  per-session receipts with full payment breakdowns, and a settings page
  showing live platform/node status and wallet balance.
- **Correct multi-tenant proxy design** — every dashboard route checks
  session ownership server-side (`canAccessSession` in `web/lib/fluxServer.ts`)
  before returning or mutating anything, so one signed-in user can never
  read or stop another user's session by guessing its ID. The public demo
  widget still works with no account, scoped to its own reserved
  `demo_visitor` identity so it never mixes with anyone's real history.
- **Reusable infrastructure** — Docker Compose brings up each service's
  database with one command; `docs/EXTENDING.md` in the API folder maps
  out exactly where to plug in horizontal scaling, real pub/sub, and
  webhook retries.

## Honest limitations

- `LndRestProvider` was built precisely to LND's documented REST API
  contract but has not been run against a live LND node in this build
  environment (none was reachable). `api/docs/LND_INTEGRATION.md` is both
  the setup guide (Polar regtest) and the verification checklist for
  closing that gap before trusting it with a node holding real funds.
- The scheduler polls for due sessions and bills them (Postgres as source
  of truth); it doesn't coordinate work across multiple API processes yet
  — see `api/docs/EXTENDING.md` for the scaling path. What drives that
  poll differs by deployment: an in-process interval on Docker/Node hosts
  (sub-second), or a once-a-minute Vercel Cron job on the serverless
  deployment.
- On the Vercel deployment specifically, two things differ from
  Docker/Node hosting, both documented in `api/README.md`'s "Known
  simplifications": tick granularity is capped at ~60s (Vercel Cron's
  minimum), and the live WebSocket session stream is unavailable (Vercel
  functions can't hold a persistent connection) — clients poll
  `GET /v1/sessions/{id}` instead, which is what `web/` already does.
- Webhook delivery is single-attempt with no retry/backoff yet (every
  attempt is still logged, so nothing is silently lost).
- The web app's settings page shows session *defaults* (rate/interval)
  stored in `localStorage`, not synced server-side per account — noted
  explicitly in the UI copy so it isn't mistaken for a persisted setting.

See `api/README.md` for the full picture on the API side, including
deployment instructions, security notes, and the complete project
structure.
