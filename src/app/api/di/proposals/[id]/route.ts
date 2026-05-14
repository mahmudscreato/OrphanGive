// Session 44 — DI proposal detail endpoint.
//
// Returns the full proposal record (including computed diff for
// UPDATE proposals) when owned by the authenticated DI. 404 collapses
// "not owned" with "not exists" so the API never reveals which
// proposal IDs the DI is or isn't allowed to see.

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import { getProposalForUser } from "@/lib/di-proposals";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const proposal = await getProposalForUser(id, session.userId);
    if (!proposal) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ proposal });
  } catch (err) {
    console.error(
      "[/api/di/proposals/[id] GET] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
