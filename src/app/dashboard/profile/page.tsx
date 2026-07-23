import { redirect } from "next/navigation";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { getDonorSponsorships } from "@/lib/sponsorship-data";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { ProfileSections } from "./ProfileSections";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Profile — OrphanGive",
};

export default async function DashboardProfilePage() {
  const donor = await getCurrentDonor();
  if (!donor) redirect("/signin?next=/dashboard/profile");
  // Profile is editable for both pending and approved donors. Other
  // states are already filtered by dashboard/layout.tsx.
  const state = getDonorState(donor);
  if (state !== "approved" && state !== "pending_approval") {
    redirect("/dashboard");
  }

  // feat/donor-account-deactivation — the BLOCK flag for the deactivate
  // section. Reuses the existing donor-scoped reader (active + paused).
  // This drives only the UI; the deactivate route re-checks server-side
  // (fail closed), so a stale value here can never wrongly deactivate.
  const blocking = await getDonorSponsorships(donor.id, {
    statuses: ["active", "paused"],
    limit: 1,
  });
  const hasActiveSponsorships = blocking.length > 0;

  return (
    <div className="space-y-10">
      <header>
        <div className="inline-flex items-center text-script-md text-tangerine-deep">
          <EyebrowIcon />
          Account
        </div>
        <h1 className="mt-3 font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
          Profile
        </h1>
        <p className="mt-2 text-[15px] text-slate italic max-w-[640px]">
          Your personal information, security, and account.
        </p>
      </header>

      <ProfileSections
        donor={{
          id: donor.id,
          email: donor.email,
          first_name: donor.first_name,
          last_name: donor.last_name,
          og_country: donor.og_country,
          og_phone: donor.og_phone,
          og_profile_photo_url: donor.og_profile_photo_url,
          og_agreed_to_terms_at: donor.og_agreed_to_terms_at,
        }}
        hasActiveSponsorships={hasActiveSponsorships}
      />
    </div>
  );
}
