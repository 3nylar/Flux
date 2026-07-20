import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, requestBodyHash } from "../src/lib/apiKeys.js";

describe("API key generation & hashing", () => {
  it("generates keys with the correct prefix and stores only a hash", () => {
    const { raw, hash, prefix } = generateApiKey("test");
    expect(raw.startsWith("flx_test_")).toBe(true);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(raw);
    expect(raw.startsWith(prefix)).toBe(true);
  });

  it("hashes deterministically so a presented key can be looked up", () => {
    const { raw, hash } = generateApiKey("live");
    expect(hashApiKey(raw)).toBe(hash);
  });

  it("distinguishes different request bodies for idempotency", () => {
    const a = requestBodyHash({ rate_per_tick_sats: 10 });
    const b = requestBodyHash({ rate_per_tick_sats: 20 });
    expect(a).not.toBe(b);
    expect(requestBodyHash({ rate_per_tick_sats: 10 })).toBe(a);
  });
});
