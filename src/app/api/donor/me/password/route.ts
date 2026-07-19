import { NextResponse, type NextRequest } from "next/server";
import { updateUser } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import { signIn } from "@/lib/auth";
import { authedDonor } from "@/lib/api-auth";
import {
  RATE_LIMITS,
  countRecentRequests,
  recordOtpRequest,
} from "@/lib/donor-signup";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

// POST /api/donor/me/password
// Body: { currentPassword: string; newPassword: string }
//
// Verifies the current password by attempting a Directus login with the
// donor's email. Login uses the public Directus client (no cookies are
// touched) so it doesn't disturb the donor's existing session. If the
// login succeeds we PATCH the user with the new password via the admin
// service token.
//
// We allow this for ALL signed-in donors regardless of approval state
// (a pending donor should be able to change their password too).
export async function POST(req: NextRequest) {
  const auth = await authedDonor({ requireApproved: false });
  if ("response" in auth) return auth.response;
  const { donor } = auth;

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";

  if (currentPassword.length === 0) {
    return NextResponse.json(
      { error: "Current password is required.", field: "currentPassword" },
      { status: 400 },
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      {
        error: "Password must be at least 8 characters.",
        field: "newPassword",
      },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      {
        error: "New password must be different from current password.",
        field: "newPassword",
      },
      { status: 400 },
    );
  }

  // #1 — throttle the change endpoint (reuses the og_otp_request rate-limit
  // pattern the OTP endpoints use). Keyed by the donor's email; counts every
  // genuine attempt so repeated current-password guesses are limited too.
  const pwLimit = RATE_LIMITS.password_change_per_email;
  const recentChanges = await countRecentRequests({
    kind: pwLimit.kind,
    email: donor.email,
    windowMs: pwLimit.windowMs,
  });
  if (recentChanges >= pwLimit.max) {
    return NextResponse.json(
      { error: "Too many password-change attempts. Please wait and try again." },
      { status: 429 },
    );
  }
  await recordOtpRequest({
    email: donor.email,
    ip: clientIp(req),
    kind: pwLimit.kind,
  });

  // Verify the current password. We do this against the public Directus
  // login endpoint — a 200 response means the credentials are correct.
  // Any thrown error means they're wrong (or the server is unreachable;
  // we treat both the same way client-side, with a friendly message).
  try {
    await signIn(donor.email, currentPassword);
  } catch {
    return NextResponse.json(
      {
        error: "Current password is incorrect.",
        field: "currentPassword",
      },
      { status: 401 },
    );
  }

  // Patch the user via the admin service token. The Donor policy doesn't
  // allow self-updating the password column directly.
  try {
    await directusServer().request(
      updateUser(donor.id as never, { password: newPassword } as never),
    );
  } catch (err) {
    console.error("[/api/donor/me/password] Directus update failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not update password. Please try again.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
