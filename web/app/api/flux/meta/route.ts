import { NextResponse } from "next/server";

const FLUX_API_URL = process.env.FLUX_API_URL || "http://localhost:8081";

export async function GET() {
  try {
    const res = await fetch(`${FLUX_API_URL}/v1/meta`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "proxy_error", message: err instanceof Error ? err.message : String(err) } },
      { status: 502 }
    );
  }
}
