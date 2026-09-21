import { NextResponse } from "next/server";
import { isConfigured, jevModel, resolveProvider } from "@/lib/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the UI whether it is actually playing Jev or the local fallback. */
export async function GET() {
  const provider = resolveProvider();
  return NextResponse.json(
    {
      jevEnabled: isConfigured(),
      provider,
      model: jevModel(provider),
      moveTimeoutMs: Number(process.env.JEV_MOVE_TIMEOUT_MS ?? 4500),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
