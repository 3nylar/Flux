# Testing Flux

## Fast unit tests (no database required)

```bash
npm test
```

This runs `test/meterEngine.test.ts`, `test/simulatedProvider.test.ts`, and
`test/apiKeys.test.ts` against an in-memory, Prisma-shaped fake store
(`test/fakePrisma.ts`) rather than a real Postgres instance. That's a
deliberate choice: the meter engine's correctness properties (no payment
after stop, safety ceilings, the circuit breaker, restart reconciliation)
are about *logic and timing*, not about SQL, so testing them against a fake
in-memory store is both faster and more deterministic than spinning up a
real database for every test run.

These tests use real timers (not mocked), so they take a genuine ~15
seconds to run -- several tests deliberately wait through 2-3 real tick
cycles to observe the scheduler's actual behavior rather than asserting
against internal state.

## Integration testing against real Postgres

The unit tests above intentionally don't exercise real SQL, real Prisma
migrations, or real concurrent-process behavior. Before deploying, run the
full stack against a real database at least once:

```bash
docker compose up -d db
cp .env.example .env
# .env's DATABASE_URL already points at the docker-compose db by default
npx prisma migrate deploy
npm run dev
```

Then exercise the API directly (see the README's quickstart curl
examples, or import docs/openapi.yaml into Postman/Insomnia) and confirm:

- POST /v1/sessions actually persists and the session shows up via
  `docker compose exec db psql -U flux -d flux -c 'select * from "Session";'`
- Restarting the API process (Ctrl+C, `npm run dev` again) while a
  session is running does NOT cause a double-payment or a stuck
  session -- watch `reconcileOnStartup`'s log line and confirm billing
  resumes on schedule.

## Testing against a real Lightning node

See docs/LND_INTEGRATION.md for the full checklist. In short: set
LIGHTNING_PROVIDER=lnd with credentials for a Polar-hosted regtest node,
and work through that document's verification checklist before trusting
LndRestProvider against a node holding real funds.

## What's deliberately not covered by automated tests

- **Load/concurrency at scale** (many simultaneous sessions across
  multiple API processes) -- the current architecture is explicitly
  single-process (see docs/EXTENDING.md), so this isn't yet a meaningful
  thing to load-test.
- **Webhook retry behavior** -- there isn't any yet (single delivery
  attempt, logged either way); see docs/EXTENDING.md for the intended
  extension point.
