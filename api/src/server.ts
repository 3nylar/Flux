import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { reconcileOnStartup } from "./services/meterEngine.js";

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await reconcileOnStartup();
  app.log.info("Session reconciliation complete");

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
