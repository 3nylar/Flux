import { randomBytes, createHash } from "node:crypto";
import type { LightningProvider, KeysendResult } from "./LightningProvider.js";
import { KeysendPaymentError } from "./LightningProvider.js";

/**
 * A fully in-process fake of keysend payments. No Lightning node, no
 * network calls -- it generates a real, valid preimage/hash pair (so
 * downstream code that verifies `sha256(preimage) === paymentHash` behaves
 * exactly as it would against a real node), waits a configurable simulated
 * latency, and occasionally fails at a configurable rate so you can exercise
 * the meter engine's circuit breaker without needing to actually break a
 * real node's connectivity.
 *
 * This is the default provider specifically so that `git clone && npm
 * install && npm run dev` gets a new contributor or evaluator a fully
 * working system with nothing else to install. Swap to `LndRestProvider`
 * (LIGHTNING_PROVIDER=lnd) when you have a real node.
 */
export class SimulatedLightningProvider implements LightningProvider {
  readonly name = "simulated";

  private balanceSats: number;

  constructor(
    private readonly opts: { failureRate: number; latencyMs: number; startingBalanceSats?: number }
  ) {
    this.balanceSats = opts.startingBalanceSats ?? 5_000_000; // 5M sats starting play-money balance
  }

  async sendKeysend(params: { destPubkey: string; amountSats: number }): Promise<KeysendResult> {
    await sleep(this.opts.latencyMs + Math.random() * this.opts.latencyMs * 0.5);

    if (!/^0[23][0-9a-fA-F]{64}$/.test(params.destPubkey)) {
      throw new KeysendPaymentError(
        "Destination is not a syntactically valid compressed public key.",
        "receiver_unreachable"
      );
    }

    if (Math.random() < this.opts.failureRate) {
      throw new KeysendPaymentError(
        "Simulated routing failure: no route found with sufficient liquidity.",
        "insufficient_liquidity"
      );
    }

    const feeSats = Math.max(1, Math.round(params.amountSats * 0.001));
    if (this.balanceSats < params.amountSats + feeSats) {
      throw new KeysendPaymentError(
        "Simulated wallet has insufficient balance for this payment.",
        "insufficient_liquidity"
      );
    }
    this.balanceSats -= params.amountSats + feeSats;

    const preimage = randomBytes(32);
    const paymentHash = createHash("sha256").update(preimage).digest();

    return {
      preimage: preimage.toString("hex"),
      paymentHash: paymentHash.toString("hex"),
      feeSats,
    };
  }

  async getWalletBalanceSats(): Promise<number> {
    return this.balanceSats;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
