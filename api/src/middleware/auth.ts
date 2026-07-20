import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { hashApiKey } from "../lib/apiKeys.js";
import { ApiError } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: { id: string; scopes: string[]; name: string };
  }
}

export async function authenticate(request: FastifyRequest): Promise<void> {
  const raw = extractKey(request);
  if (!raw) throw ApiError.unauthorized();

  const keyHash = hashApiKey(raw);
  const key = await prisma.apiKey.findUnique({ where: { keyHash } });

  if (!key || key.revokedAt) throw ApiError.invalidApiKey();

  request.apiKey = { id: key.id, scopes: key.scopes, name: key.name };

  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}

export function requireScope(scope: string) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.apiKey) throw ApiError.unauthorized();
    const { scopes } = request.apiKey;
    if (!scopes.includes(scope) && !scopes.includes("*")) {
      throw ApiError.forbidden(`This key is missing the required scope: ${scope}.`);
    }
  };
}

function extractKey(request: FastifyRequest): string | null {
  const auth = request.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const apiKeyHeader = request.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) return apiKeyHeader.trim();
  return null;
}
