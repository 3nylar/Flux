/**
 * Thin server-side client for the Flux API. This file only ever runs on
 * the Next.js server (inside route handlers under app/api/flux/*), never
 * in the browser -- that's the whole point: FLUX_API_KEY stays server-side,
 * and the browser talks to *our* proxy routes instead of holding a real
 * API key itself. This is the pattern any real integration should follow.
 */
import { auth } from "@/lib/auth";

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

/**
 * Every dashboard proxy route scopes its Flux API calls to the signed-in
 * user's own `external_user_id` (their NextAuth user ID), never trusting
 * a client-supplied ID. Returns null if nobody is signed in, so callers
 * can return a 401 without leaking anything.
 */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/** external_user_id used for the public, unauthenticated homepage demo. */
export const DEMO_USER_ID = "demo_visitor";

/**
 * A session is readable/stoppable by whoever started it: the anonymous
 * public demo widget can read/stop its own "demo_visitor" sessions with no
 * account, and a signed-in user can read/stop only sessions tagged with
 * their own account ID. Everyone else gets a 404 (not a 403) so session
 * IDs can't be used to probe for the existence of other users' sessions.
 */
export function canAccessSession(sessionExternalUserId: string | undefined, signedInUserId: string | null): boolean {
  if (sessionExternalUserId === DEMO_USER_ID) return true;
  return Boolean(signedInUserId) && sessionExternalUserId === signedInUserId;
}
