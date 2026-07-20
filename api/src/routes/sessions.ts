import type { FastifyInstance } from "fastify";
import { authenticate, requireScope } from "../middleware/auth.js";
import { checkIdempotency, storeIdempotentResponse } from "../middleware/idempotency.js";
import { parseOrThrow } from "./_helpers.js";
import { prisma } from "../lib/prisma.js";
import {
  startSession,
  stopSession,
  getSession,
  listSessions,
} from "../services/meterEngine.js";
import { serializeSession, serializePayment } from "../services/serializers.js";
import { hashApiKey } from "../lib/apiKeys.js";
import {
  startSessionSchema,
  stopSessionSchema,
  listSessionsQuerySchema,
} from "../schemas/requests.js";

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/sessions",
    { preHandler: [authenticate, requireScope("sessions:write")] },
    async (req, reply) => {
      if (await checkIdempotency(req, reply)) return;
      const body = parseOrThrow(startSessionSchema, req.body);
      const session = await startSession({
        apiKeyId: req.apiKey!.id,
        externalUserId: body.external_user_id,
        receiverPubkey: body.receiver_pubkey,
        ratePerTickSats: body.rate_per_tick_sats,
        tickIntervalSeconds: body.tick_interval_seconds,
        maxDurationSeconds: body.max_duration_seconds,
        maxTotalSats: body.max_total_sats,
      });
      const response = { data: serializeSession(session) };
      await storeIdempotentResponse(req, 201, response);
      reply.code(201);
      return response;
    }
  );

  app.get(
    "/v1/sessions",
    { preHandler: [authenticate, requireScope("sessions:read")] },
    async (req) => {
      const q = parseOrThrow(listSessionsQuerySchema, req.query);
      const { sessions, total } = await listSessions(req.apiKey!.id, q.limit, q.offset, {
        externalUserId: q.external_user_id,
        state: q.state,
      });
      return {
        data: sessions.map(serializeSession),
        pagination: { total, limit: q.limit, offset: q.offset },
      };
    }
  );

  app.get(
    "/v1/sessions/:id",
    { preHandler: [authenticate, requireScope("sessions:read")] },
    async (req) => {
      const id = (req.params as { id: string }).id;
      const session = await getSession(req.apiKey!.id, id);
      return { data: serializeSession(session) };
    }
  );

  app.post(
    "/v1/sessions/:id/stop",
    { preHandler: [authenticate, requireScope("sessions:write")] },
    async (req, reply) => {
      if (await checkIdempotency(req, reply)) return;
      const id = (req.params as { id: string }).id;
      const body = parseOrThrow(stopSessionSchema, req.body ?? {});
      const session = await stopSession(req.apiKey!.id, id, body.reason);
      const response = { data: serializeSession(session) };
      await storeIdempotentResponse(req, 200, response);
      return response;
    }
  );

  app.get(
    "/v1/sessions/:id/payments",
    { preHandler: [authenticate, requireScope("sessions:read")] },
    async (req) => {
      const id = (req.params as { id: string }).id;
      await getSession(req.apiKey!.id, id); // 404s / ownership check
      const q = parseOrThrow(listSessionsQuerySchema, req.query);
      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: { sessionId: id },
          orderBy: { attemptedAt: "desc" },
          take: q.limit,
          skip: q.offset,
        }),
        prisma.payment.count({ where: { sessionId: id } }),
      ]);
      return {
        data: payments.map(serializePayment),
        pagination: { total, limit: q.limit, offset: q.offset },
      };
    }
  );

  // --- Live streaming (WebSocket) ----------------------------------------
  // GET /v1/sessions/:id/stream?api_key=... -- API keys are normally sent
  // as a header, but browsers' native WebSocket API cannot set custom
  // headers, so this one endpoint also accepts the key as a query param.
  // Treat it the same as a header for auth purposes.
  app.get("/v1/sessions/:id/stream", { websocket: true }, async (socket, req) => {
    const id = (req.params as { id: string }).id;
    const query = req.query as { api_key?: string };
    const rawKey = extractKeyFromHeaderOrQuery(req.headers["authorization"], query.api_key);

    if (!rawKey) {
      socket.close(4401, "unauthorized");
      return;
    }
    const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(rawKey) } });
    if (!key || key.revokedAt) {
      socket.close(4401, "unauthorized");
      return;
    }

    const session = await prisma.session.findFirst({ where: { id, apiKeyId: key.id } });
    if (!session) {
      socket.close(4404, "not_found");
      return;
    }

    socket.send(JSON.stringify({ type: "session.snapshot", data: serializeSession(session) }));

    // Poll-and-diff rather than a pub/sub bus, to keep this reference
    // implementation dependency-free (no Redis required). See
    // docs/EXTENDING.md for swapping in a real pub/sub layer at scale.
    let lastTotal = session.totalSats;
    let lastState = session.state;
    const interval = setInterval(async () => {
      const current = await prisma.session.findUnique({ where: { id } });
      if (!current) return;
      if (current.totalSats !== lastTotal || current.state !== lastState) {
        lastTotal = current.totalSats;
        lastState = current.state;
        socket.send(JSON.stringify({ type: "session.update", data: serializeSession(current) }));
      }
      if (current.state === "STOPPED" || current.state === "FAILED") {
        clearInterval(interval);
        socket.close(1000, "session_ended");
      }
    }, 1000);

    socket.on("close", () => clearInterval(interval));
  });
}

function extractKeyFromHeaderOrQuery(
  authHeader: string | undefined,
  queryKey: string | undefined
): string | null {
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  if (queryKey) return queryKey;
  return null;
}
