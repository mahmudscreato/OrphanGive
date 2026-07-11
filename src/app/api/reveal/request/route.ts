import { NextResponse, type NextRequest } from "next/server";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import {
  createRevealRequest,
  countRevealsToday,
  isAllowedRevealField,
  REVEAL_FIELD_LABELS,
  RevealRequestError,
} from "@/lib/reveal-data";
import { notifyAdminOfPendingSubmission } from "@/lib/di-notify";

export const runtime = "nodejs";

const DAILY_REVEAL_LIMIT = 10;

export async function POST(req: NextRequest) {
  // Auth gate
  const donor = await getCurrentDonor();
  if (!donor) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const state = getDonorState(donor);
  if (state !== "approved") {
    return NextResponse.json(
      { error: "Your account isn't approved to request reveals yet." },
      { status: 403 },
    );
  }

  // Parse body
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { childId, fieldName, donorReason } = body as Record<string, unknown>;

  if (typeof childId !== "string" || typeof fieldName !== "string") {
    return NextResponse.json(
      { error: "childId and fieldName are required." },
      { status: 400 },
    );
  }
  if (!isAllowedRevealField(fieldName)) {
    return NextResponse.json(
      { error: "That field cannot be requested." },
      { status: 400 },
    );
  }

  // Per-donor rate limit (24h rolling)
  const todayCount = await countRevealsToday(donor.id);
  if (todayCount >= DAILY_REVEAL_LIMIT) {
    return NextResponse.json(
      { error: "Daily reveal request limit reached. Try again tomorrow." },
      { status: 429 },
    );
  }

  try {
    const created = await createRevealRequest({
      donorId: donor.id,
      childId,
      fieldName,
      donorReason: typeof donorReason === "string" ? donorReason : null,
    });

    // fix/reveal-decision-loop (R2) — tell admins a request is waiting.
    // Best-effort: notifyAdminOfPendingSubmission swallows its own
    // errors, but wrap anyway so a notify failure can NEVER fail the
    // request creation the donor just succeeded at.
    try {
      const fieldLabel = isAllowedRevealField(fieldName)
        ? REVEAL_FIELD_LABELS[fieldName]
        : fieldName;
      await notifyAdminOfPendingSubmission({
        collection: "reveal_request",
        recordId: created.id,
        submittedByUserId: donor.id,
        childId,
        summary: `A donor requested access to "${fieldLabel}" — review it in the reveal queue.`,
      });
    } catch (err) {
      console.warn(
        "[api/reveal/request] admin notify failed (non-fatal)",
        err instanceof Error ? err.message : err,
      );
    }

    return NextResponse.json({ request: created });
  } catch (err) {
    if (err instanceof RevealRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/reveal/request] unexpected", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
