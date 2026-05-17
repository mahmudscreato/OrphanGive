// Session 47 — Full notifications page.
//
// Server component. Pre-loads the first page of notifications, hands
// them to the client NotificationsList for interactive read-state
// updates.

import { requireDiUser } from "@/lib/di-auth";
import { listNotificationsForUser } from "@/lib/di-notifications";
import { NotificationsList } from "@/components/di/NotificationsList";

export const dynamic = "force-dynamic";

export default async function DiNotificationsPage() {
  const session = await requireDiUser();
  const notifications = await listNotificationsForUser(session.userId, {
    limit: 100,
  });

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Notifications
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Updates from admin on your submissions, assignments, and
          deliveries.
        </p>
      </header>

      <NotificationsList initial={notifications} />
    </div>
  );
}
