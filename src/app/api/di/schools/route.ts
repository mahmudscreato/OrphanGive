// Session 48a — DI school list endpoint.
//
// GET /api/di/schools?q=<query>
// Returns schools sorted alphabetically, max 20 by default.
// Empty query returns the alphabetical first 20.
//
// Status mapping:
//   200 ok                   — { schools }
//   401 unauthorized

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import { listSchools } from "@/lib/di-schools";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw
    ? Math.max(1, Math.min(50, Number(limitRaw)))
    : 20;

  const schools = await listSchools({ q, limit });
  return NextResponse.json({ schools });
}
