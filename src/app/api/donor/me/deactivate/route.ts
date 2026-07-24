// feat/donor-account-deactivation — POST /api/donor/me/deactivate
//
// Donor deactivates their OWN account. REVERSIBLE (status → 'suspended',
// no data erased). BLOCKED server-side if the donor has any active/paused
// sponsorship — re-checked here (fail closed) so a stale UI or a direct
// call can't bypass it.
//
// On success: audit (in the lib), best-effort confirmation email, then END
// THE SESSION (Directus logout + clear cookies) so the donor is signed out
// immediately. A deactivated donor can't sign back in (Directus blocks
// non-active status); support reactivates via the admin reactivate action.
//
// Status mapping:
//   200 ok                 — { success: true }
//   401 unauthorized
//   409 active_sponsorships — has active/paused sponsorships (with a link)
//   500 deactivation_failed — fail-closed (verification/write error)

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authedDonor } from "@/lib/api-auth";
import {
  deactivateOwnDonorAccount,
  HasActiveSponsorshipsError,
  DeactivationFailedError,
} from "@/lib/donor-account-actions";
import { sendEmail } from "@/lib/email";
import { formatTo } from "@/lib/email-data";
import { DonorDeactivatedEmail } from "@/emails/DonorDeactivatedEmail";
import { signOut, ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

const SUPPORT_EMAIL = "support@orphangive.org";

export async function POST(req: NextRequest) {
  const auth = await authedDonor({ requireApproved: false });
  if ("response" in auth) return auth.response;
  const { donor } = auth;

  // Deactivate — the lib enforces the no-active-sponsorship block (fail
  // closed) + flips status + audits.
  try {
    await deactivateOwnDonorAccount(donor.id, req);
  } catch (err) {
    if (err instanceof HasActiveSponsorshipsError) {
      return NextResponse.json(
        {
          error: "active_sponsorships",
          message:
            "You have active sponsorships. Please cancel or end them before deactivating your account.",
          sponsorshipsUrl: "/dashboard/sponsorships",
        },
        { status: 409 },
      );
    }
    if (err instanceof DeactivationFailedError) {
      return NextResponse.json(
        {
          error: "deactivation_failed",
          message: "Couldn't deactivate right now. Please try again.",
        },
        { status: 500 },
      );
    }
    console.error(
      "[/api/donor/me/deactivate] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Best-effort confirmation email — never affects the deactivation result.
  try {
    const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
    await sendEmail({
      to: formatTo(donor.email, firstName),
      subject: "Your OrphanGive account has been deactivated",
      template: DonorDeactivatedEmail({ firstName, supportEmail: SUPPORT_EMAIL }),
    });
  } catch (err) {
    console.warn(
      "[/api/donor/me/deactivate] confirmation email failed (non-fatal)",
      err instanceof Error ? err.message : err,
    );
  }

  // End the session — Directus logout (best-effort) + clear cookies so the
  // donor is signed out immediately. Their status is now non-active, so
  // they can't sign back in until support reactivates.
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  await signOut(refreshToken);
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);

  // The client redirects here — a signed-out confirmation.
  return NextResponse.json({ success: true, redirectTo: "/signin?deactivated=1" });
}
