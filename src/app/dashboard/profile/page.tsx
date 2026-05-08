import { redirect } from "next/navigation";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
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

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
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
      />
    </div>
  );
}
