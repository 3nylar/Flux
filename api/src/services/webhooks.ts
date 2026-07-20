import { createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type FluxEventType =
  | "session.started"
  | "payment.sent"
  | "payment.failed"
  | "session.stopped"
  | "session.autostopped";

/**
 * Fire-and-forget webhook dispatch: looks up every enabled webhook the API
 * key has registered for this event type, signs the payload with the
 * webhook's own secret (HMAC-SHA256, in the same style as Stripe/GitHub),
 * and POSTs it. Delivery is logged either way so a missed event is
 * debuggable rather than silently lost.
 *
 * This deliberately does not retry with backoff in this reference
 * implementation -- see docs/EXTENDING.md for how to plug in a durable
 * retry queue (e.g. BullMQ) for production-grade delivery guarantees.
 */
export async function emitEvent(
  apiKeyId: string,
  eventType: FluxEventType,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { apiKeyId, disabledAt: null, events: { has: eventType } },
    });

    await Promise.all(webhooks.map((wh) => deliver(wh.id, wh.url, wh.secret, eventType, data)));
  } catch {
    // Webhook dispatch must never take down the meter engine.
  }
}

async function deliver(
  webhookId: string,
  url: string,
  secret: string,
  eventType: FluxEventType,
  data: Record<string, unknown>
): Promise<void> {
  const payload = {
    id: `evt_${randomBytes(12).toString("hex")}`,
    type: eventType,
    created_at: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  const delivery = await prisma.webhookDelivery.create({
    data: { webhookId, eventType, payload: payload as Prisma.InputJsonValue, status: "PENDING" },
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Flux-Signature": `sha256=${signature}`,
        "Flux-Event-Type": eventType,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: res.ok ? "DELIVERED" : "FAILED",
        responseCode: res.status,
        attempts: { increment: 1 },
        deliveredAt: res.ok ? new Date() : null,
      },
    });
  } catch {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", attempts: { increment: 1 } },
    });
  }
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}
