import { redirect } from "next/navigation";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { listDonorPaymentMethods } from "@/lib/payment-methods";
import { BillingSections } from "./BillingSections";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Billing — OrphanGive",
};

export default async function DashboardBillingPage() {
  const donor = await getCurrentDonor();
  if (!donor) redirect("/signin?next=/dashboard/billing");
  if (getDonorState(donor) !== "approved") redirect("/dashboard");

  // Pre-load payment methods server-side so the first paint is populated.
  // The client refreshes from /api/donor/me/payment-methods after any
  // mutation.
  const initialPaymentMethods = await listDonorPaymentMethods(
    donor.og_stripe_customer_id,
  ).catch(() => []);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
          Billing
        </h1>
        <p className="mt-2 text-[15px] text-slate italic max-w-[640px]">
          Saved cards and downloadable receipts.
        </p>
      </header>

      <BillingSections
        hasStripeCustomer={Boolean(donor.og_stripe_customer_id)}
        initialPaymentMethods={initialPaymentMethods}
      />
    </div>
  );
}
