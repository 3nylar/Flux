import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";

/**
 * Vercel serverless entrypoint. Reuses the same Fastify app the Docker/
 * self-host build runs (src/app.ts's buildApp() never calls .listen()),
 * so every route, the error handler, and auth middleware need no
 * Vercel-specific changes. Built once per warm container and reused
 * across invocations that land on it.
 *
 * Lives under api/api/ (not api/index.ts) because Vercel's serverless
 * function convention requires an `api/` directory relative to the
 * project root -- this project's root directory is itself `api/`
 * (see vercel.json / the linked project's Root Directory setting).
 */
let appPromise: ReturnType<typeof buildApp> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!appPromise) appPromise = buildApp();
  const app = await appPromise;
  await app.ready();
  app.server.emit("request", req, res);
}
