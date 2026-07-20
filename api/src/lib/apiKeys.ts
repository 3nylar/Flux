import { createHash, randomBytes } from "node:crypto";

/**
 * API keys follow the format `flx_live_<40 hex chars>` (or `flx_test_...`).
 * The raw key is returned to the integrator exactly once at creation and
 * never stored; we persist only its SHA-256 hash, so a database compromise
 * never yields usable credentials.
 */

export const API_KEY_PREFIX_LIVE = "flx_live_";
export const API_KEY_PREFIX_TEST = "flx_test_";

export function generateApiKey(mode: "live" | "test" = "test"): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const random = randomBytes(20).toString("hex");
  const prefixWord = mode === "live" ? API_KEY_PREFIX_LIVE : API_KEY_PREFIX_TEST;
  const raw = `${prefixWord}${random}`;
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, prefixWord.length + 8);
  return { raw, hash, prefix };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function requestBodyHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}
