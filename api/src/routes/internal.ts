import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { sweepDueSessions } from "../services/meterEngine.js";

/**
 * Driven by Vercel Cron (see vercel.json) once a minute on the serverless
 * deployment, in place of the in-process setInterval sweep used by the
 * self-hosted/Docker entrypoint (server.ts). Guarded by CRON_SECRET rather
 * than an API key -- this isn't a client-facing endpoint.
 */
export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.post("/internal/tick", async (req, reply) => {
    if (!isAuthorized(req.headers["authorization"])) {
      reply.code(401).send({ error: { code: "authentication_required", message: "Missing or invalid cron secret." } });
      return;
    }
    const result = await sweepDueSessions();
    return { data: result };
  });
}

function isAuthorized(authHeader: string | undefined): boolean {
  if (!env.CRON_SECRET || !authHeader?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authHeader.slice(7).trim());
  const expected = Buffer.from(env.CRON_SECRET);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
