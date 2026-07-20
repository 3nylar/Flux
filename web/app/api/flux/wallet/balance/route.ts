import { NextResponse } from "next/server";
import { fluxFetch, FluxApiError, requireUserId } from "@/lib/fluxServer";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json(
      { error: { code: "authentication_required", message: "Sign in required." } },
      { status: 401 }
    );
  }
  try {
    const data = await fluxFetch("/v1/wallet/balance");
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
