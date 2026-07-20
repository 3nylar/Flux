import "dotenv/config";
import { z } from "zod";

/**
 * Which Lightning backend this instance signs payments with.
 *
 *  - "simulated": a fully in-process, deterministic-enough fake that mimics
 *    keysend latency and occasional routing failures, with NO real
 *    Lightning node required. This is the default so the project runs with
 *    zero external infrastructure for local development, demos, and CI.
 *
 *  - "lnd": real keysend payments via an LND node's REST API. Requires
 *    LND_REST_URL and LND_MACAROON_HEX (and usually LND_TLS_CERT_BASE64
 *    unless your LND is behind a proxy that terminates TLS for you).
 */
const providerSchema = z.enum(["simulated", "lnd"]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8081),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:8081"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  LIGHTNING_PROVIDER: providerSchema.default("simulated"),
  LND_REST_URL: z.string().url().optional(),
  LND_MACAROON_HEX: z
    .string()
    .regex(/^[a-fA-F0-9]+$/, "LND_MACAROON_HEX must be hex-encoded")
    .optional(),
  LND_TLS_CERT_BASE64: z.string().optional(),

  // Simulated-provider tuning, useful for exercising failure handling in
  // tests and demos without a real node.
  SIM_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  SIM_LATENCY_MS: z.coerce.number().int().min(0).default(150),

  // Meter engine safety bounds -- enforced server-side regardless of what a
  // client requests, so a buggy or malicious integrator can't cause
  // unbounded spend.
  MAX_SESSION_DURATION_SECONDS: z.coerce.number().int().positive().default(6 * 3600),
  MAX_TOTAL_SATS_PER_SESSION: z.coerce.number().int().positive().default(1_000_000),
  MIN_TICK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(1),
  MAX_CONSECUTIVE_PAYMENT_FAILURES: z.coerce.number().int().positive().default(3),
  STALE_SESSION_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  WEBHOOK_SIGNING_SECRET: z.string().min(16).optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  if (env.LIGHTNING_PROVIDER === "lnd") {
    if (!env.LND_REST_URL || !env.LND_MACAROON_HEX) {
      throw new Error(
        "LIGHTNING_PROVIDER=lnd requires LND_REST_URL and LND_MACAROON_HEX to be set."
      );
    }
  }

  return env;
}

export const env = loadEnv();
export type Env = typeof env;
