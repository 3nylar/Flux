import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import { ApiError } from "./lib/errors.js";
import { hashApiKey } from "./lib/apiKeys.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { sessionRoutes } from "./routes/sessions.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { metaRoutes } from "./routes/meta.js";
import { docsRoutes } from "./routes/docs.js";
import { internalRoutes } from "./routes/internal.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers['x-api-key']"],
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
    genReqId: () => randomUUID(),
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true });
  if (env.ENABLE_WEBSOCKET_STREAM) {
    await app.register(websocket);
  }

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    // Redis-backed when REDIS_URL is set (required for correct limiting
    // across multiple serverless instances); falls back to the in-memory
    // default store otherwise, which is fine for a single-process self-host.
    ...(redis ? { redis } : {}),
    keyGenerator: (req) => {
      const auth = req.headers["authorization"];
      if (auth?.startsWith("Bearer ")) return `key:${hashApiKey(auth.slice(7).trim())}`;
      const xApiKey = req.headers["x-api-key"];
      if (typeof xApiKey === "string") return `key:${hashApiKey(xApiKey)}`;
      return `ip:${req.ip}`;
    },
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: "rate_limit_exceeded",
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
        docs_url: `${env.PUBLIC_BASE_URL}/docs#rate-limits`,
      },
    }),
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const requestId = request.id;

    if (error instanceof ApiError) {
      reply.code(error.statusCode).send(error.toBody(requestId));
      return;
    }

    const err = error as { statusCode?: number; message?: string };

    if (err.statusCode === 429) {
      reply.code(429).send(error);
      return;
    }
    if (err.statusCode && err.statusCode < 500) {
      reply.code(err.statusCode).send({
        error: { code: "invalid_request", message: err.message ?? "Invalid request.", request_id: requestId },
      });
      return;
    }

    request.log.error({ err: error, requestId }, "Unhandled error");
    reply.code(500).send(ApiError.internal().toBody(requestId));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: "resource_not_found",
        message: `No route for ${request.method} ${request.url}.`,
        request_id: request.id,
        docs_url: `${env.PUBLIC_BASE_URL}/docs`,
      },
    });
  });

  await app.register(metaRoutes);
  await app.register(docsRoutes);
  await app.register(sessionRoutes);
  await app.register(webhookRoutes);
  await app.register(internalRoutes);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
