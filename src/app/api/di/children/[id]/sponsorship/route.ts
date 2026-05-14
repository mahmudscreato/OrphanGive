// Session 43 — DI sponsorship API for a single child.
//
// Used by Session 44 (Mark Delivery sponsorship dropdown) and
// Session 45 (real-time sponsorship refresh in Child Detail).
//
// The child detail page itself renders sponsorships server-side via
// `getDiChildSponsorships`, so this route isn't strictly needed for
// V1 of Session 43 — but it's the same scope-checked, PII-redacted
// data path future sessions will hit, so we ship it now to lock the
// contract in.
//
// Response shapes:
//   200 { sponsorships: DiSponsorshipView[] }    — child in scope (array may be empty)
//   401 { error: 'unauthorized' }                — missing / invalid DI session
//   404 { error: 'not_found' }                   — child doesn't exist OR is out of scope
//   500 { error: 'server_error' }                — unexpected (logged server-side)
//
// Out-of-scope and not-found are deliberately collapsed into a single
// 404 so the API never reveals which child IDs the DI is or isn't
// allowed to see.

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import { getDiChildSponsorships } from "@/lib/di-children";

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
    const sponsorships = await getDiChildSponsorships(id, session.userId);
    if (sponsorships === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ sponsorships });
  } catch (err) {
    console.error(
      "[/api/di/children/[id]/sponsorship] server_error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
