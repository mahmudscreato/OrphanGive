// Session 52b — Donor-facing intake photo read.
//
// Returns ONLY approved photos for the child, sorted by
// display_order. Donor surface gates strictly on status='approved' —
// pending/rejected/archived rows are invisible per the "show only
// what's reviewed" rule (audited in Session 49's gap doc + the
// comment block in /children/[id]/page.tsx).
//
// Returns the file UUID so the gallery component can render an
// /api/assets/{uuid} URL. We don't expose any uploader / reviewer
// metadata on the donor surface — caption is the only descriptive
// field that surfaces.

import "server-only";

import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";

export interface DonorIntakePhoto {
  id: string;
  photoUuid: string;
  photoUrl: string;
  caption: string | null;
  displayOrder: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getApprovedIntakePhotosForChild(
  childId: string,
): Promise<DonorIntakePhoto[]> {
  if (!UUID_RE.test(childId)) return [];

  let rows: Array<{
    id: string;
    photo: string | null;
    caption: string | null;
    display_order: number | null;
  }> = [];
  try {
    const result = (await directusServer().request(
      readItems("child_intake_photo" as never, {
        filter: {
          _and: [
            { child: { _eq: childId } },
            { status: { _eq: "approved" } },
          ],
        },
        fields: ["id", "photo", "caption", "display_order"],
        sort: ["display_order"],
        limit: -1,
      } as never),
    )) as unknown as typeof rows | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[donor-intake-photos] getApprovedIntakePhotosForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  return rows
    .filter((r) => r.photo)
    .map((r) => ({
      id: r.id,
      photoUuid: r.photo!,
      photoUrl: `/api/assets/${r.photo}`,
      caption: r.caption?.trim() || null,
      displayOrder: typeof r.display_order === "number" ? r.display_order : 0,
    }));
}

/**
 * Tiny helper: does this donor have an active or paused sponsorship
 * for this specific child? Used by IntakePhotoGallery to decide
 * whether to unblur photos 2-N.
 *
 * Returns false for any missing input (no donor / no child / not
 * a sponsor). The donor profile page passes `null` for donor when
 * the viewer is unauthenticated.
 */
export async function isSponsorOfChild(
  donorId: string | null,
  childId: string,
): Promise<boolean> {
  if (!donorId || !UUID_RE.test(donorId) || !UUID_RE.test(childId)) return false;
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { donor: { _eq: donorId } },
            { child: { _eq: childId } },
            { status: { _in: ["active", "paused"] } },
          ],
        },
        fields: ["id"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.warn(
      "[donor-intake-photos] isSponsorOfChild failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
