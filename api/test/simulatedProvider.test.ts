import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { SimulatedLightningProvider } from "../src/providers/SimulatedLightningProvider.js";
import { KeysendPaymentError } from "../src/providers/LightningProvider.js";

const VALID_PUBKEY = "03" + "cd".repeat(32);

describe("SimulatedLightningProvider", () => {
  it("produces a preimage whose sha256 matches the returned payment hash", async () => {
    const provider = new SimulatedLightningProvider({ failureRate: 0, latencyMs: 1 });
    const result = await provider.sendKeysend({ destPubkey: VALID_PUBKEY, amountSats: 100 });

    const expectedHash = createHash("sha256").update(Buffer.from(result.preimage, "hex")).digest("hex");
    expect(result.paymentHash).toBe(expectedHash);
  });

  it("rejects a syntactically invalid destination pubkey", async () => {
    const provider = new SimulatedLightningProvider({ failureRate: 0, latencyMs: 1 });
    await expect(
      provider.sendKeysend({ destPubkey: "not-a-pubkey", amountSats: 100 })
    ).rejects.toThrow(KeysendPaymentError);
  });

  it("always fails when failureRate is 1", async () => {
    const provider = new SimulatedLightningProvider({ failureRate: 1, latencyMs: 1 });
    await expect(
      provider.sendKeysend({ destPubkey: VALID_PUBKEY, amountSats: 100 })
    ).rejects.toThrow(KeysendPaymentError);
  });

  it("never fails when failureRate is 0, across many attempts", async () => {
    const provider = new SimulatedLightningProvider({ failureRate: 0, latencyMs: 1 });
    for (let i = 0; i < 20; i++) {
      await expect(
        provider.sendKeysend({ destPubkey: VALID_PUBKEY, amountSats: 10 })
      ).resolves.toBeDefined();
    }
  });

  it("decrements wallet balance by amount + fee on each successful payment", async () => {
    const provider = new SimulatedLightningProvider({
      failureRate: 0,
      latencyMs: 1,
      startingBalanceSats: 1000,
    });
    const before = await provider.getWalletBalanceSats();
    const result = await provider.sendKeysend({ destPubkey: VALID_PUBKEY, amountSats: 100 });
    const after = await provider.getWalletBalanceSats();
    expect(before - after).toBe(100 + result.feeSats);
  });

  it("throws insufficient_liquidity once the simulated balance is exhausted", async () => {
    const provider = new SimulatedLightningProvider({
      failureRate: 0,
      latencyMs: 1,
      startingBalanceSats: 50,
    });
    await expect(
      provider.sendKeysend({ destPubkey: VALID_PUBKEY, amountSats: 100 })
    ).rejects.toMatchObject({ reason: "insufficient_liquidity" });
  });
});
