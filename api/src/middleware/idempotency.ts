import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requestBodyHash } from "../lib/apiKeys.js";
import { ApiError } from "../lib/errors.js";

/**
 * Idempotency for write endpoints (chiefly `POST /v1/sessions`): a client
 * that times out waiting for a response and retries must not accidentally
 * start a second billing session. See the identical pattern in the
 * companion Auctra API for the full rationale.
 */
export async function checkIdempotency(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || key.length === 0) return false;
  if (!request.apiKey) throw ApiError.unauthorized();

  const existing = await prisma.idempotencyKey.findUnique({
    where: { apiKeyId_key: { apiKeyId: request.apiKey.id, key } },
  });

  if (existing) {
    const currentHash = requestBodyHash(request.body);
    if (existing.requestHash !== currentHash) {
      throw ApiError.conflict(
        "idempotency_conflict",
        "This Idempotency-Key was already used with a different request body."
      );
    }
    reply.code(existing.responseCode).send(existing.responseBody);
    return true;
  }

  return false;
}

export async function storeIdempotentResponse(
  request: FastifyRequest,
  responseCode: number,
  responseBody: unknown
): Promise<void> {
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || key.length === 0 || !request.apiKey) return;

  await prisma.idempotencyKey
    .create({
      data: {
        apiKeyId: request.apiKey.id,
        key,
        requestHash: requestBodyHash(request.body),
        responseBody: responseBody as object,
        responseCode,
      },
    })
    .catch(() => {});
}
