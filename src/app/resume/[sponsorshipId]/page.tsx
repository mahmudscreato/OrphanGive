// Session 58.6 — /resume/[sponsorshipId]
//
// Resume an abandoned pending_payment sponsorship by re-mounting
// Stripe Elements against the EXISTING PI/sub the donor's original
// /api/donate/init created. Auth-gated; redirects out if the donor
// doesn't own the row or the row isn't in pending_payment.
//
// On confirm, navigates to /donate/success?id=… so the webhook +
// existing success page handle the rest. No duplicate sponsorship
// row, no duplicate Stripe charge.

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentDonor } from "@/lib/donor-data";
import { getSponsorshipForDonor } from "@/lib/sponsorship-data";
import { ResumeClient } from "./ResumeClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Complete your payment — OrphanGive",
};

interface RawSponsorship {
  status: string;
  donor_currency_code?: string | null;
  donor_currency_amount?: number | string | null;
  amount_usd?: number | string | null;
  payment_schedule?: string | null;
  duration_months?: number | null;
}

function coerceDecimal(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export default async function ResumePage({
  params,
}: {
  params: Promise<{ sponsorshipId: string }>;
}) {
  const { sponsorshipId } = await params;

  const donor = await getCurrentDonor();
  if (!donor) {
    redirect(`/signin?next=/resume/${encodeURIComponent(sponsorshipId)}`);
  }

  const sponsorship = (await getSponsorshipForDonor(
    sponsorshipId,
    donor.id,
  )) as (RawSponsorship & { id: string }) | null;
  if (!sponsorship) notFound();

  // Only resume pending_payment rows. Anything else routes back to
  // the dashboard where the donor sees the current state.
  if (sponsorship.status !== "pending_payment") {
    redirect("/dashboard/sponsorships");
  }

  const donorAmount = coerceDecimal(sponsorship.donor_currency_amount);
  const usdAmount = coerceDecimal(sponsorship.amount_usd);
  const isPrepaid = sponsorship.payment_schedule === "monthly_prepaid";
  const months = sponsorship.duration_months ?? null;

  // Display amount: prefer donor-currency snapshot; fall back to
  // USD-equivalent for legacy rows pre-58.2.
  const summaryLine =
    donorAmount != null && sponsorship.donor_currency_code
      ? isPrepaid && months
        ? `${(donorAmount * months).toLocaleString()} ${sponsorship.donor_currency_code} (${months} months upfront)`
        : `${donorAmount.toLocaleString()} ${sponsorship.donor_currency_code}${
            sponsorship.payment_schedule === "monthly" ? " / month" : ""
          }`
      : usdAmount != null
        ? isPrepaid && months
          ? `$${(usdAmount * months).toLocaleString()} (${months} months upfront)`
          : `$${usdAmount.toLocaleString()}${
              sponsorship.payment_schedule === "monthly" ? " / month" : ""
            }`
        : "your sponsorship";

  return (
    <main className="min-h-screen bg-bg-canvas">
      <div className="mx-auto max-w-xl px-5 md:px-8 py-10 md:py-14">
        <Link
          href="/dashboard/sponsorships"
          className="inline-flex items-center gap-1 text-[13px] text-slate hover:text-tangerine-deeper mb-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to your sponsorships
        </Link>

        <h1 className="font-serif text-3xl text-ink mb-1">
          Complete your payment
        </h1>
        <p className="text-[14.5px] text-slate mb-6 leading-relaxed">
          You're about to finish{" "}
          <span className="font-medium text-ink">{summaryLine}</span>. We've
          re-loaded the original payment — confirm your card below to
          complete.
        </p>

        <ResumeClient sponsorshipId={sponsorshipId} />
      </div>
    </main>
  );
}
