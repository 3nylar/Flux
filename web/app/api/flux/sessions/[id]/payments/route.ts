import { NextRequest, NextResponse } from "next/server";
import { fluxFetch, FluxApiError, requireUserId, canAccessSession } from "@/lib/fluxServer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sessionData = (await fluxFetch(`/v1/sessions/${id}`)) as {
      data?: { external_user_id?: string };
    };
    const userId = await requireUserId();
    if (!canAccessSession(sessionData.data?.external_user_id, userId)) {
      return NextResponse.json(
        { error: { code: "resource_not_found", message: "No such session." } },
        { status: 404 }
      );
    }

    const data = await fluxFetch(`/v1/sessions/${id}/payments?limit=100`);
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
