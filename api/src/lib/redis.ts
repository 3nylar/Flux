import Redis from "ioredis";
import { env } from "../config/env.js";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis = env.REDIS_URL
  ? (globalForRedis.redis ?? new Redis(env.REDIS_URL))
  : undefined;

if (process.env.NODE_ENV !== "production" && redis) {
  globalForRedis.redis = redis;
}
