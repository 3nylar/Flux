/**
 * The meter engine (src/services/meterEngine.ts) never talks to a Lightning
 * node directly -- it talks to this interface. That's what makes Flux
 * "reusable infrastructure" rather than a single hard-wired integration:
 * swapping Lightning backends (a different node implementation, a
 * multi-node router, a mock for CI) means writing one new class here, with
 * zero changes anywhere else in the codebase.
 */
export interface KeysendResult {
  /** Hex-encoded 32-byte payment preimage -- proof of payment. */
  preimage: string;
  /** Hex-encoded 32-byte payment hash (sha256 of the preimage). */
  paymentHash: string;
  /** Routing fee paid, in satoshis. */
  feeSats: number;
}

export class KeysendPaymentError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | "receiver_unreachable"
      | "insufficient_liquidity"
      | "receiver_keysend_disabled"
      | "node_unavailable"
      | "unknown"
  ) {
    super(message);
    this.name = "KeysendPaymentError";
  }
}

export interface LightningProvider {
  /** Send a single spontaneous (keysend) payment. Resolves on settlement. */
  sendKeysend(params: { destPubkey: string; amountSats: number }): Promise<KeysendResult>;

  /** Current spendable balance of the platform's Lightning wallet, in sats. */
  getWalletBalanceSats(): Promise<number>;

  /** Human-readable name, surfaced in /v1/meta for operational visibility. */
  readonly name: string;
}
