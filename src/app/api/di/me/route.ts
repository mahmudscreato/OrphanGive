// Session 42 — DI Dashboard /api/di/me.
//
// GET → returns the current DI user's metadata.
//
// Used by:
//   - Header / sidebar greeting
//   - Future client islands that need the DI's id or assigned divisions
//     without re-fetching from Directus
//
// 401 if not authenticated as a Data Inputter. Same role check as the
// layout — a stale cookie whose user has since been removed from the
// Data Inputter role surfaces as 401 here.

import { NextResponse } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.json({
    id: session.userId,
    first_name: session.firstName,
    last_name: session.lastName,
    email: session.email,
    assigned_divisions: session.assignedDivisions,
  });
}
