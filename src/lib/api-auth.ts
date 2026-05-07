import { NextResponse } from "next/server";
import { getCurrentDonor, getDonorState, type Donor } from "./donor-data";

// ─── authedDonor ─────────────────────────────────────────────────────────────
//
// Standard auth gate for /api/donor/me/* routes. Returns either:
//   - { donor }                  on success
//   - { response: NextResponse } when the request should be rejected
//
// Usage:
//   const auth = await authedDonor();
//   if ("response" in auth) return auth.response;
//   const { donor } = auth;
//
// The helper lives in its own module (not donor-data.ts) so it can pull
// in NextResponse without dragging that into the server-render code path.
export type AuthedDonorResult =
  | { donor: Donor }
  | { response: NextResponse };

type Options = {
  // Pass false for routes that should work for any signed-in user
  // regardless of approval state (e.g. profile editing should still
  // work for pending-approval donors who want to fix their info).
  // Default true — most billing/sponsorship routes need 'approved'.
  requireApproved?: boolean;
};

export async function authedDonor(
  options: Options = {},
): Promise<AuthedDonorResult> {
  const requireApproved = options.requireApproved ?? true;

  const donor = await getCurrentDonor();
  if (!donor) {
    return {
      response: NextResponse.json(
        { error: "Not signed in." },
        { status: 401 },
      ),
    };
  }

  if (requireApproved) {
    const state = getDonorState(donor);
    if (state !== "approved") {
      return {
        response: NextResponse.json(
          { error: "Account is not approved." },
          { status: 403 },
        ),
      };
    }
  }

  return { donor };
}
