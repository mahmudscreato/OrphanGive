import { NextResponse } from "next/server";
import { getCurrentDonor } from "@/lib/donor-data";
import { getDonorSponsorships } from "@/lib/sponsorship-data";

export const runtime = "nodejs";

export async function GET() {
  const donor = await getCurrentDonor();
  if (!donor) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const rows = await getDonorSponsorships(donor.id, { limit: 10 });
  return NextResponse.json({
    sponsorships: rows.map((s) => ({
      id: s.id,
      status: s.status,
      payment_mode: s.payment_mode,
      amount_usd: s.amount_usd,
      started_at: s.started_at,
      next_billing_date: s.next_billing_date,
      child:
        typeof s.child === "string"
          ? { id: s.child, display_name: null }
          : s.child
            ? { id: s.child.id, display_name: s.child.display_name ?? null }
            : null,
    })),
  });
}
