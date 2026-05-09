// Secondary "give more" affordance shown beneath the management
// actions on ACTIVE sponsorship detail pages. Lets a donor send an
// additional one-time gift to the same child without having to leave
// the detail page and navigate back to the child's profile.
//
// Visual treatment: a subtle separator between the management
// cluster ("Add more months", "Cancel sponsorship") and this give-
// more CTA so the two intents read distinctly. Tone is moss-soft —
// less load-bearing than the primary actions above it.
//
// Routes to /sponsor/[childId]?mode=one_time so the sponsor flow
// skips step 1 (mode picker) and lands the donor on step 2 (amount).

import Link from "next/link";

type Props = {
  childId: string;
  childName: string;
  // Spec: active monthly/prepaid → "Send a one-time gift to [Child]"
  //       active one-time        → "Send another one-time gift"
  // The "another" framing applies when the donor's existing row is
  // already a one-time gift; otherwise the copy is fresh.
  alreadyOneTime?: boolean;
};

export function GiveMoreCTA({
  childId,
  childName,
  alreadyOneTime = false,
}: Props) {
  const firstName = (childName?.trim() || "").split(/\s+/)[0] || "this child";
  const label = alreadyOneTime
    ? `Send another one-time gift`
    : `Send ${firstName} a one-time gift`;
  return (
    <section
      aria-label="Give more"
      className="mt-8 pt-6 border-t border-moss-soft"
    >
      <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-moss-deep mb-3">
        Want to give more?
      </div>
      <Link
        href={`/sponsor/${childId}?mode=one_time`}
        className="inline-flex items-center justify-center font-body font-semibold rounded-full bg-white border-[1.5px] border-moss/40 text-moss-deep px-5 py-[10px] text-[13.5px] transition-colors hover:bg-moss-soft hover:border-moss"
      >
        {label}
      </Link>
    </section>
  );
}

export default GiveMoreCTA;
