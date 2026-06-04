// DI Activity — dedicated recent-activity log page.
//
// Step 2 of the DI dashboard revamp: the recent-activity feed used to
// live at the bottom of the /di Home dashboard. It now has its own
// page so Home stays focused on action items. Reuses the EXACT same
// component (RecentActivityPanel) and data source (getRecentActivityForUser)
// the Home feed used — just with a larger limit since this is dedicated.

import { requireDiUser } from "@/lib/di-auth";
import { getRecentActivityForUser } from "@/lib/di-audit";
import { RecentActivityPanel } from "@/components/di/RecentActivityPanel";

export const dynamic = "force-dynamic";

export default async function DiActivityPage() {
  const session = await requireDiUser();
  // Dedicated page → show more entries than Home's feed did (10).
  const events = await getRecentActivityForUser(session.userId, 50);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Activity
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          A log of your recent work and admin actions on the children in
          your scope.
        </p>
      </header>

      <RecentActivityPanel events={events} />
    </div>
  );
}
