import type { FastifyInstance } from "fastify";
import { authenticate, requireScope } from "../middleware/auth.js";
import { parseOrThrow } from "./_helpers.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/errors.js";
import { generateWebhookSecret } from "../services/webhooks.js";
import { createWebhookSchema } from "../schemas/requests.js";

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/webhooks",
    { preHandler: [authenticate, requireScope("webhooks:write")] },
    async (req, reply) => {
      const body = parseOrThrow(createWebhookSchema, req.body);
      const secret = generateWebhookSecret();
      const webhook = await prisma.webhook.create({
        data: { apiKeyId: req.apiKey!.id, url: body.url, events: body.events, secret },
      });
      reply.code(201);
      return {
        data: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          secret,
          created_at: webhook.createdAt.toISOString(),
        },
      };
    }
  );

  app.get(
    "/v1/webhooks",
    { preHandler: [authenticate, requireScope("webhooks:read")] },
    async (req) => {
      const webhooks = await prisma.webhook.findMany({ where: { apiKeyId: req.apiKey!.id } });
      return {
        data: webhooks.map((w) => ({
          id: w.id,
          url: w.url,
          events: w.events,
          disabled: Boolean(w.disabledAt),
          created_at: w.createdAt.toISOString(),
        })),
      };
    }
  );

  app.delete(
    "/v1/webhooks/:id",
    { preHandler: [authenticate, requireScope("webhooks:write")] },
    async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const webhook = await prisma.webhook.findFirst({ where: { id, apiKeyId: req.apiKey!.id } });
      if (!webhook) throw ApiError.notFound("webhook");
      await prisma.webhook.update({ where: { id }, data: { disabledAt: new Date() } });
      reply.code(204);
      return null;
    }
  );
}
