import { env } from "../config/env.js";
import type { LightningProvider } from "./LightningProvider.js";
import { SimulatedLightningProvider } from "./SimulatedLightningProvider.js";
import { LndRestProvider } from "./LndRestProvider.js";

let instance: LightningProvider | null = null;

export function getLightningProvider(): LightningProvider {
  if (instance) return instance;

  if (env.LIGHTNING_PROVIDER === "lnd") {
    instance = new LndRestProvider({
      restUrl: env.LND_REST_URL!,
      macaroonHex: env.LND_MACAROON_HEX!,
      tlsCertBase64: env.LND_TLS_CERT_BASE64,
    });
  } else {
    instance = new SimulatedLightningProvider({
      failureRate: env.SIM_FAILURE_RATE,
      latencyMs: env.SIM_LATENCY_MS,
    });
  }

  return instance;
}

/** Test-only hook to inject a fake provider without touching env vars. */
export function __setLightningProviderForTests(provider: LightningProvider): void {
  instance = provider;
}
