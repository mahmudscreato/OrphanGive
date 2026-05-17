// Session 51 — Reviews placeholder.
//
// Session 52 fills in the actual review queues for moments, intake
// photos, deliveries, and documents. For now this is the landing
// page the home tiles route to (other than Pending proposals which
// has its own dedicated list at /admin/proposals).

import { ListChecks, Camera, FileText, Truck } from "lucide-react";

export const dynamic = "force-dynamic";

const QUEUES = [
  {
    label: "Timeline moments",
    description:
      "Photos and short videos posted by the DI team about a child's life. Donors see these once you publish.",
    icon: Camera,
  },
  {
    label: "Intake photos",
    description:
      "Initial-visit evidence photos that document the child's situation. Tier 2 — sponsors see these post-consent.",
    icon: Camera,
  },
  {
    label: "Aid deliveries",
    description:
      "DI team logs each handover. Reviewing here verifies the delivery happened as reported.",
    icon: Truck,
  },
  {
    label: "Documents",
    description:
      "Birth certificates, NIDs, school recommendations. Tier 3 — admin-only verification trail.",
    icon: FileText,
  },
];

export default function AdminReviewsPlaceholderPage() {
  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Reviews
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Coming soon. Session 52 fills in the queues below.
        </p>
      </header>

      <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 text-amber-700 shrink-0">
            <ListChecks className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-[20px] text-ink leading-tight">
              Four queues land here
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-soft leading-relaxed">
              Each will mirror the proposals queue: oldest first, click-
              through to detail with approve/reject actions.
            </p>
          </div>
        </div>
        <ul className="space-y-3">
          {QUEUES.map((q) => {
            const Icon = q.icon;
            return (
              <li
                key={q.label}
                className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50/40 p-3.5"
              >
                <Icon
                  className="w-4 h-4 mt-0.5 text-stone-500 stroke-[1.75] shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-[14px] text-ink font-medium leading-snug">
                    {q.label}
                  </p>
                  <p className="text-[12.5px] text-ink-soft leading-relaxed mt-0.5">
                    {q.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
