// Update a sponsorship's public-visibility choice (named / anonymous).
// Session 14.6.
//
// Donor-controlled, post-hoc editable from /dashboard/sponsorship/[id].
// No Stripe round-trip — visibility lives purely on the Directus row;
// it drives only the public child page banner and donor-facing UI
// affordances ("Shown publicly" line on the sponsorship card).
//
// Auth: standard authedSponsorship — donor must be signed in, approved,
// and own this sponsorship row.
//
// Idempotent: writing the same value twice is fine and returns the row.
import { NextResponse, type NextRequest } from "next/server";
import { authedSponsorship } from "@/lib/sponsorship-actions";
import { updateSponsorship } from "@/lib/sponsorship-data";
import { isValidVisibility } from "@/lib/visibility";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await authedSponsorship(id);
  if (!auth.ok) return auth.response;
  const { sponsorship } = auth.ctx;

  let body: { visibility?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const next = body.visibility;
  if (!isValidVisibility(next)) {
    return NextResponse.json(
      { error: "visibility must be 'named' or 'anonymous'." },
      { status: 400 },
    );
  }

  // Refuse for terminal-state rows — there's no public surface to
  // affect (the child's banner reads from active rows only) and we
  // don't want to mutate finalized records. Active / paused / pending
  // are all valid.
  if (
    sponsorship.status !== "active" &&
    sponsorship.status !== "paused" &&
    sponsorship.status !== "pending_payment"
  ) {
    return NextResponse.json(
      {
        error: `Cannot edit visibility on a sponsorship in state ${sponsorship.status}.`,
      },
      { status: 400 },
    );
  }

  try {
    await updateSponsorship(sponsorship.id, { visibility: next });
  } catch (err) {
    console.error("[sponsorship/visibility] update failed:", err);
    return NextResponse.json(
      { error: "Internal update failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, visibility: next });
}
