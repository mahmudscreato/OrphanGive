import { redirect } from "next/navigation";
import {
  getCurrentDonor,
  getDonorState,
} from "@/lib/donor-data";
import { getAllDonorReveals } from "@/lib/reveal-data";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { RevealRequestsSection } from "../components/RevealRequestsSection";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Information access — OrphanGive",
};

export default async function DashboardInformationAccessPage() {
  const donor = await getCurrentDonor();
  if (!donor) redirect("/signin?next=/dashboard/information-access");
  const state = getDonorState(donor);
  if (state !== "approved") redirect("/dashboard");

  const requests = await getAllDonorReveals(donor.id);

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center text-script-md text-tangerine-deep">
          <EyebrowIcon />
          Reveal requests
        </div>
        <h1 className="mt-3 font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
          Information access
        </h1>
        <p className="mt-2 text-[15px] text-slate italic max-w-[640px]">
          Approvals last 90 days. We&apos;ll email you when a request is
          reviewed.
        </p>
      </header>

      {requests.length === 0 ? (
        <p className="text-[14.5px] text-slate-soft leading-[1.6] max-w-[560px]">
          You haven&apos;t requested access to sensitive information yet.
          Visit a child&apos;s profile to request specific details, like
          their address or guardian&apos;s phone number.
        </p>
      ) : (
        <RevealRequestsSection requests={requests} />
      )}
    </div>
  );
}
