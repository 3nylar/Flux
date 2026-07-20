/**
 * Thin server-side client for the Flux API. This file only ever runs on
 * the Next.js server (inside route handlers under app/api/flux/*), never
 * in the browser -- that's the whole point: FLUX_API_KEY stays server-side,
 * and the browser talks to *our* proxy routes instead of holding a real
 * API key itself. This is the pattern any real integration should follow.
 */

const FLUX_API_URL = process.env.FLUX_API_URL || "http://localhost:8081";
const FLUX_API_KEY = process.env.FLUX_API_KEY || "";

export class FluxApiError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(`Flux API error ${status}`);
  }
}

export async function fluxFetch(path: string, init?: RequestInit): Promise<unknown> {
  if (!FLUX_API_KEY) {
    throw new Error(
      "FLUX_API_KEY is not configured on the server. Set it in .env.local (see .env.example)."
    );
  }

  const res = await fetch(`${FLUX_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FLUX_API_KEY}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new FluxApiError(res.status, body);
  }
  return body;
}
