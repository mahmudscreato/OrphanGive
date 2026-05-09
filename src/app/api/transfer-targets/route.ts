// Lists active children for the queue-shift "Transfer to another
// child" picker (Session 14.7 Phase 2). Returns id + display_name
// only — the picker is a chooser, not a profile surface.
//
// Auth: signed-in donor (approved). The list of active children is
// already public via /children, so we don't gate harder than that.

import { NextResponse } from "next/server";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";

export const runtime = "nodejs";

export async function GET() {
  const donor = await getCurrentDonor();
  if (!donor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (getDonorState(donor) !== "approved") {
    return NextResponse.json({ error: "not approved" }, { status: 403 });
  }

  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { status: { _eq: "active" } },
        fields: ["id", "display_name"],
        sort: ["display_name"],
        limit: 200,
      } as never),
    )) as unknown as Array<{ id: string; display_name: string | null }>;

    const children = (rows ?? [])
      .filter((r) => r.display_name)
      .map((r) => ({
        id: String(r.id),
        display_name: String(r.display_name),
      }));

    return NextResponse.json({ children });
  } catch (err) {
    console.warn(
      "[api/transfer-targets] query failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ children: [] });
  }
}
