// Shared helpers for /api/sponsorship/[id]/* action routes.
// Auth + ownership check, plus a small util to read the {id} param.

import { NextResponse } from "next/server";
import { getCurrentDonor, getDonorState, type Donor } from "./donor-data";
import {
  getSponsorshipForDonor,
  type Sponsorship,
} from "./sponsorship-data";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthedSponsorshipContext = {
  donor: Donor;
  sponsorship: Sponsorship;
};

export type AuthedSponsorshipResult =
  | { ok: true; ctx: AuthedSponsorshipContext }
  | { ok: false; response: NextResponse };

// Three-tier check:
//   1. id param is a UUID         → 404 otherwise (don't reveal a lookup)
//   2. donor signed in + approved → 401/403
//   3. sponsorship exists + owned → 404 otherwise (don't reveal existence)
export async function authedSponsorship(
  rawId: string | undefined,
): Promise<AuthedSponsorshipResult> {
  if (!rawId || !UUID_RE.test(rawId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }
  const donor = await getCurrentDonor();
  if (!donor) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }
  if (getDonorState(donor) !== "approved") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Account is not approved." },
        { status: 403 },
      ),
    };
  }
  const sponsorship = await getSponsorshipForDonor(rawId, donor.id);
  if (!sponsorship) {
    // Either truly missing or owned by a different donor — return 404 in
    // both cases so we don't disclose the existence of someone else's row.
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }
  return { ok: true, ctx: { donor, sponsorship } };
}
