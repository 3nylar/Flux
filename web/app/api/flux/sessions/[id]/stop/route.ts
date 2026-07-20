import { NextRequest, NextResponse } from "next/server";
import { fluxFetch, FluxApiError, requireUserId, canAccessSession } from "@/lib/fluxServer";
import { randomUUID } from "node:crypto";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Check ownership BEFORE stopping -- a session belongs to whoever
    // started it (the anonymous demo tag, or a real signed-in user).
    const existing = (await fluxFetch(`/v1/sessions/${id}`)) as { data?: { external_user_id?: string } };
    const userId = await requireUserId();
    if (!canAccessSession(existing.data?.external_user_id, userId)) {
      return NextResponse.json(
        { error: { code: "resource_not_found", message: "No such session." } },
        { status: 404 }
      );
    }

    const data = await fluxFetch(`/v1/sessions/${id}/stop`, {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ reason: "user_clicked_stop" }),
    });
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
