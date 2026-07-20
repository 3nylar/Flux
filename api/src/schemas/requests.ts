import { z } from "zod";

export const externalUserIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_\-:.]+$/, "May contain letters, numbers, and _-:. only.");

export const startSessionSchema = z.object({
  external_user_id: externalUserIdSchema,
  receiver_pubkey: z.string().regex(/^0[23][0-9a-fA-F]{64}$/, "Must be a 33-byte compressed pubkey (66 hex chars)."),
  rate_per_tick_sats: z.coerce.number().int().min(1),
  tick_interval_seconds: z.coerce.number().int().min(1),
  max_duration_seconds: z.coerce.number().int().min(1).optional(),
  max_total_sats: z.coerce.number().int().min(1).optional(),
});

export const stopSessionSchema = z.object({
  reason: z.string().max(200).optional(),
});

export const listSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z
    .array(z.enum(["session.started", "payment.sent", "payment.failed", "session.stopped", "session.autostopped"]))
    .min(1),
});
