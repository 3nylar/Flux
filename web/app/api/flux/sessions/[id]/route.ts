import { NextRequest, NextResponse } from "next/server";
import { fluxFetch, FluxApiError } from "@/lib/fluxServer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await fluxFetch(`/v1/sessions/${id}`);
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
