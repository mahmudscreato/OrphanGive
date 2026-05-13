// Two-button block surfaced on the sponsorship detail page when the
// row is in a TERMINAL state (completed / cancelled) — both states
// show the same affordance: get back to giving.
//
// Layout:
//   primary   = tangerine fill, white text — "Sponsor [Child] again
//                monthly" or "Send another one-time gift" depending on
//                what the row was originally
//   secondary = white fill, slate-soft border — the OPPOSITE mode so
//                every donor-child relationship offers BOTH paths
//                back to giving
//
// Both buttons route to /sponsor/[childId]?mode=… which the sponsor
// flow reads on mount: step 1 (mode picker) is skipped and the donor
// lands on step 2 (amount) with the chosen mode pre-selected.
//
// Side-by-side on desktop, stacked on mobile.

import Link from "next/link";

type Props = {
  childId: string;
  childName: string;
  // What the donor was originally doing on this row. Drives copy +
  // primary/secondary ordering: a donor who used to sponsor monthly
  // gets "Sponsor [Child] again monthly" as the primary action.
  originalPaymentMode: "monthly" | "one_time";
};

export function ReSupportButtons({
  childId,
  childName,
  originalPaymentMode,
}: Props) {
  // Use first name when reasonable, fall back to "this child" so the
  // copy stays grammatical when display_name is empty/just whitespace.
  const firstName = (childName?.trim() || "").split(/\s+/)[0] || "this child";

  // Primary mirrors the original commitment shape; secondary is the
  // opposite mode. Per spec:
  //   completed/cancelled monthly → primary="Sponsor X again monthly",
  //                                  secondary="Send a one-time gift"
  //   completed/cancelled one-time → primary="Send another one-time gift",
  //                                  secondary="Start monthly sponsorship"
  const primary =
    originalPaymentMode === "monthly"
      ? {
          href: `/sponsor/${childId}?mode=monthly`,
          label: `Sponsor ${firstName} again monthly`,
        }
      : {
          href: `/sponsor/${childId}?mode=one_time`,
          label: `Send another one-time gift`,
        };
  const secondary =
    originalPaymentMode === "monthly"
      ? {
          href: `/sponsor/${childId}?mode=one_time`,
          label: `Send ${firstName} a one-time gift`,
        }
      : {
          href: `/sponsor/${childId}?mode=monthly`,
          label: `Start monthly sponsorship`,
        };

  return (
    <section className="mt-10">
      <div className="flex items-stretch gap-3 max-md:flex-col">
        <Link
          href={primary.href}
          className="inline-flex items-center justify-center font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep"
        >
          {primary.label}
        </Link>
        <Link
          href={secondary.href}
          className="inline-flex items-center justify-center font-body font-medium rounded-full bg-white border-[1.5px] border-ink/[0.16] text-ink px-6 py-[12px] text-[14px] transition-colors hover:border-ink/[0.32] hover:bg-cream"
        >
          {secondary.label}
        </Link>
      </div>
    </section>
  );
}

export default ReSupportButtons;
