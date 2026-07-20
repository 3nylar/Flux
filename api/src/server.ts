import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { sweepDueSessions } from "./services/meterEngine.js";

async function main(): Promise<void> {
  const app = await buildApp();

  // Self-hosted/Docker deployments have a persistent process, so they get
  // sub-minute ticking for free via a plain interval -- the same
  // sweepDueSessions() the Vercel deployment drives with a once-a-minute
  // cron job (see src/routes/internal.ts, vercel.json).
  const sweepInterval = setInterval(() => void sweepDueSessions(), 1000);
  sweepInterval.unref?.();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    clearInterval(sweepInterval);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      `Flux API listening on ${env.HOST}:${env.PORT} (Lightning provider: ${env.LIGHTNING_PROVIDER})`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
