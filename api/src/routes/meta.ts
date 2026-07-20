import type { FastifyInstance } from "fastify";
import { authenticate, requireScope } from "../middleware/auth.js";
import { getLightningProvider } from "../providers/index.js";
import { env } from "../config/env.js";

export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/v1/meta", async () => {
    const provider = getLightningProvider();
    let reachable = true;
    let balanceSats: number | null = null;
    try {
      balanceSats = await provider.getWalletBalanceSats();
    } catch {
      reachable = false;
    }
    return {
      data: {
        lightning_provider: provider.name,
        node_reachable: reachable,
        wallet_balance_sats: balanceSats,
        max_session_duration_seconds: env.MAX_SESSION_DURATION_SECONDS,
        max_total_sats_per_session: env.MAX_TOTAL_SATS_PER_SESSION,
        min_tick_interval_seconds: env.MIN_TICK_INTERVAL_SECONDS,
      },
    };
  });

  app.get(
    "/v1/wallet/balance",
    { preHandler: [authenticate, requireScope("sessions:read")] },
    async () => {
      const provider = getLightningProvider();
      const balanceSats = await provider.getWalletBalanceSats();
      return { data: { balance_sats: balanceSats, provider: provider.name } };
    }
  );
}
