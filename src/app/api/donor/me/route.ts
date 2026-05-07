import { NextResponse, type NextRequest } from "next/server";
import { updateUser } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import { authedDonor } from "@/lib/api-auth";
import { COUNTRY_BY_CODE } from "@/lib/countries";

export const runtime = "nodejs";

// PATCH /api/donor/me — Update the signed-in donor's editable profile
// fields. Only first_name, last_name, og_country, og_phone, and
// og_profile_photo_url are accepted; everything else is ignored. Email
// is read-only on the dashboard (deferred to a separate flow with
// re-verification, see Part B spec).
//
// We don't require approval state here — pending donors should be able
// to fix typos in their info while waiting for review.
export async function PATCH(req: NextRequest) {
  const auth = await authedDonor({ requireApproved: false });
  if ("response" in auth) return auth.response;
  const { donor } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if ("first_name" in body) {
    const v = typeof body.first_name === "string" ? body.first_name.trim() : "";
    if (v.length === 0) {
      return NextResponse.json(
        { error: "First name is required.", field: "first_name" },
        { status: 400 },
      );
    }
    if (v.length > 80) {
      return NextResponse.json(
        { error: "First name is too long.", field: "first_name" },
        { status: 400 },
      );
    }
    patch.first_name = v;
  }

  if ("last_name" in body) {
    const v = typeof body.last_name === "string" ? body.last_name.trim() : "";
    if (v.length === 0) {
      return NextResponse.json(
        { error: "Last name is required.", field: "last_name" },
        { status: 400 },
      );
    }
    if (v.length > 80) {
      return NextResponse.json(
        { error: "Last name is too long.", field: "last_name" },
        { status: 400 },
      );
    }
    patch.last_name = v;
  }

  if ("country" in body || "og_country" in body) {
    const raw = (body.country ?? body.og_country) as unknown;
    const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    if (v.length === 0) {
      return NextResponse.json(
        { error: "Country is required.", field: "country" },
        { status: 400 },
      );
    }
    if (!COUNTRY_BY_CODE[v]) {
      return NextResponse.json(
        { error: "Unrecognised country code.", field: "country" },
        { status: 400 },
      );
    }
    patch.og_country = v;
  }

  if ("phone" in body || "og_phone" in body) {
    const raw = (body.phone ?? body.og_phone) as unknown;
    // Phone is optional — empty string clears it.
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v.length > 40) {
      return NextResponse.json(
        { error: "Phone number is too long.", field: "phone" },
        { status: 400 },
      );
    }
    patch.og_phone = v.length > 0 ? v : null;
  }

  if ("profile_photo_url" in body || "og_profile_photo_url" in body) {
    const raw = (body.profile_photo_url ?? body.og_profile_photo_url) as unknown;
    if (raw === null) {
      patch.og_profile_photo_url = null;
    } else if (typeof raw === "string") {
      const v = raw.trim();
      if (v.length === 0) {
        patch.og_profile_photo_url = null;
      } else if (!/^https:\/\/res\.cloudinary\.com\//.test(v)) {
        // Defensive — only accept Cloudinary URLs. Prevents an attacker
        // from setting profile_photo_url to a tracking-pixel URL.
        return NextResponse.json(
          { error: "Profile photo URL must be a Cloudinary URL." },
          { status: 400 },
        );
      } else {
        patch.og_profile_photo_url = v;
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update." },
      { status: 400 },
    );
  }

  try {
    await directusServer().request(
      updateUser(donor.id as never, patch as never),
    );
  } catch (err) {
    console.error("[/api/donor/me PATCH] Directus update failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not save profile. Please try again.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, updated: patch });
}
