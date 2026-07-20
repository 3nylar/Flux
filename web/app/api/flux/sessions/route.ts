import { NextRequest, NextResponse } from "next/server";
import { fluxFetch, FluxApiError, requireUserId } from "@/lib/fluxServer";
import { randomUUID } from "node:crypto";

const DEMO_USER_ID = "demo_visitor";

/**
 * Anyone can start a session (the public homepage widget uses this
 * unauthenticated, tagged as "demo_visitor" so it never pollutes a real
 * account's history). If the caller IS signed in, their real account ID is
 * used instead, so the session shows up in their /dashboard history.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = await requireUserId();

    const data = await fluxFetch("/v1/sessions", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ ...body, external_user_id: userId ?? DEMO_USER_ID }),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    if (err instanceof FluxApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json(
      { error: { code: "proxy_error", message: err instanceof Error ? err.message : String(err) } },
      { status: 500 }
    );
  }
}

/** Session history -- always scoped to the signed-in user. Requires auth. */
export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json(
      { error: { code: "authentication_required", message: "Sign in to view session history." } },
      { status: 401 }
    );
  }

  try {
    const params = req.nextUrl.searchParams;
    const qs = new URLSearchParams({
      external_user_id: userId,
      limit: params.get("limit") ?? "20",
      offset: params.get("offset") ?? "0",
    });
    if (params.get("state")) qs.set("state", params.get("state")!);

    const data = await fluxFetch(`/v1/sessions?${qs.toString()}`);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof FluxApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json(
      { error: { code: "proxy_error", message: err instanceof Error ? err.message : String(err) } },
      { status: 500 }
    );
  }
}
