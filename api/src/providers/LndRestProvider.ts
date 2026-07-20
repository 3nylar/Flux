import { randomBytes, createHash } from "node:crypto";
import { Agent } from "node:https";
import type { LightningProvider, KeysendResult } from "./LightningProvider.js";
import { KeysendPaymentError } from "./LightningProvider.js";

/**
 * Real keysend payments via LND's REST API (the grpc-gateway HTTP proxy
 * every LND node exposes alongside its gRPC interface, documented at
 * https://lightning.engineering/api-docs/api/lnd/rest-endpoints).
 *
 * KEYSEND MECHANICS: a keysend payment is an ordinary Lightning payment
 * that attaches the payment preimage directly in a custom TLV record
 * (type `5482373484`) on the final hop, instead of the receiver having
 * issued an invoice first. The sender:
 *   1. generates a random 32-byte preimage,
 *   2. computes payment_hash = sha256(preimage),
 *   3. sends both the hash (so the payment can be tracked/settled like any
 *      other HTLC) and the preimage itself (base64-encoded, under TLV key
 *      "5482373484") to LND's SendPaymentSync endpoint.
 * The receiving node must have keysend explicitly enabled
 * (`--accept-keysend` in lnd.conf) or it will reject the payment.
 *
 * IMPORTANT VERIFICATION NOTE: this implementation was built directly
 * against LND's published REST API reference. It has not been exercised
 * against a live LND node in this project's build environment (no
 * Lightning node was reachable there). Before relying on it in production,
 * verify it end-to-end against your own regtest node (Polar is the easiest
 * way to spin one up) -- see docs/LND_INTEGRATION.md for a verification
 * checklist and known field-naming gotchas across LND versions.
 */
export class LndRestProvider implements LightningProvider {
  readonly name = "lnd";

  private readonly baseUrl: string;
  private readonly macaroonHex: string;
  private readonly agent: Agent | undefined;

  constructor(opts: { restUrl: string; macaroonHex: string; tlsCertBase64?: string }) {
    this.baseUrl = opts.restUrl.replace(/\/$/, "");
    this.macaroonHex = opts.macaroonHex;
    this.agent = opts.tlsCertBase64
      ? new Agent({ ca: Buffer.from(opts.tlsCertBase64, "base64") })
      : undefined;
  }

  async sendKeysend(params: { destPubkey: string; amountSats: number }): Promise<KeysendResult> {
    const preimage = randomBytes(32);
    const paymentHash = createHash("sha256").update(preimage).digest();

    // KEYSEND_PREIMAGE_TYPE per BOLT-defined TLV record conventions used
    // across LND, CLN, and Eclair.
    const KEYSEND_PREIMAGE_TYPE = "5482373484";

    const body = {
      dest: hexToBase64(stripHexPrefix(params.destPubkey)),
      amt: String(params.amountSats),
      payment_hash: paymentHash.toString("base64"),
      dest_custom_records: {
        [KEYSEND_PREIMAGE_TYPE]: preimage.toString("base64"),
      },
      // Cap routing fees at 1% (min 5 sats) so a pathological route can't
      // silently eat the whole payment in fees.
      fee_limit: { fixed: String(Math.max(5, Math.round(params.amountSats * 0.01))) },
      timeout_seconds: 30,
    };

    const res = await this.request("POST", "/v1/channels/transactions", body);

    // LND's synchronous send endpoint returns 200 with an in-body
    // `payment_error` string on routing failure, rather than a non-2xx
    // HTTP status -- both cases are handled here.
    if (res.payment_error) {
      throw classifyLndError(String(res.payment_error));
    }
    if (!res.payment_preimage) {
      throw new KeysendPaymentError("LND returned no preimage and no error.", "unknown");
    }

    const returnedPreimage = Buffer.from(res.payment_preimage as string, "base64").toString("hex");
    const route = res.payment_route as { total_fees?: string } | undefined;
    const feeSats = route?.total_fees ? Number(route.total_fees) : 0;

    return { preimage: returnedPreimage, paymentHash: paymentHash.toString("hex"), feeSats };
  }

  async getWalletBalanceSats(): Promise<number> {
    const res = await this.request("GET", "/v1/balance/blockchain");
    // Lightning-specific spendable balance is /v1/channels for total local
    // balance across channels; we sum it here since that's what's actually
    // spendable for outbound keysend payments.
    const channels = await this.request("GET", "/v1/channels");
    const list = (channels.channels ?? []) as Array<{ local_balance?: string }>;
    const total = list.reduce((sum, c) => sum + Number(c.local_balance ?? 0), 0);
    void res; // on-chain balance intentionally not counted as spendable for LN payments
    return total;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Grpc-Metadata-macaroon": this.macaroonHex,
        },
        body: body ? JSON.stringify(body) : undefined,
        // @ts-expect-error -- Node's fetch accepts a custom agent via dispatcher in newer versions;
        // this is a best-effort hook for self-signed certs and safely ignored if unsupported.
        agent: this.agent,
      });
    } catch (err) {
      throw new KeysendPaymentError(
        `Could not reach LND REST endpoint: ${err instanceof Error ? err.message : String(err)}`,
        "node_unavailable"
      );
    }

    const text = await response.text();
    let json: Record<string, unknown>;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new KeysendPaymentError(`LND returned non-JSON response: ${text.slice(0, 200)}`, "unknown");
    }

    if (!response.ok) {
      const message = (json.message as string) ?? `LND REST error ${response.status}`;
      throw new KeysendPaymentError(message, "node_unavailable");
    }

    return json;
  }
}

function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function hexToBase64(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64");
}

function classifyLndError(message: string): KeysendPaymentError {
  const lower = message.toLowerCase();
  if (lower.includes("no_route") || lower.includes("unable to find")) {
    return new KeysendPaymentError(message, "insufficient_liquidity");
  }
  if (lower.includes("keysend") || lower.includes("unknown payment hash")) {
    return new KeysendPaymentError(message, "receiver_keysend_disabled");
  }
  return new KeysendPaymentError(message, "unknown");
}
