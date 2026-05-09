// Public-page banner showing the current sponsor + queue (Sessions
// 14.6 + 14.7). Visual states:
//
//   • Sponsored, empty queue:
//       "Sponsored monthly by Suaida until Jul 27. You can join the
//        queue from the sponsor page."
//   • Sponsored, queue depth 1:
//       "Sponsored monthly until Mar 27 by Suaida, then by Anik
//        until Jul 27. You can support Fahim from Jul 27 onward."
//   • Sponsored, queue depth 2-3:
//       "Sponsored monthly until Mar 27 by Suaida, then by Anik
//        until Jul 27. N more sponsors are in queue. You can support
//        Fahim from [final queued end date]."
//   • Queue full (3 queued):
//       "Sponsored monthly until [final queued end date]. Sponsor
//        queue is full. You can still send a one-time gift today."
//   • Open (no active sponsor): banner is omitted by the page;
//       this component never receives that state.
//
// Privacy: only the donor's first name is ever surfaced, and only
// when they opted into visibility='named'. Anonymous donors render
// as "an anonymous donor". labelForVisibility / effectiveVisibility
// apply the privacy-preserving fallback (null/legacy → anonymous).

import type { QueueDisplaySlot } from "@/lib/queue";

type Props = {
  // The child's first name only — used in the headline copy ("X has
  // a monthly sponsor"). Never exposes last name.
  childFirstName: string;
  // The currently-supporting sponsor. When null (no active monthly),
  // the page should not render this banner at all.
  active: QueueDisplaySlot | null;
  // Queued donors in position order (1, 2, 3). Empty if no queue.
  queued: QueueDisplaySlot[];
  // True when queue is at capacity; banner switches to "queue is
  // full" copy.
  isFull: boolean;
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function nameOrAnonymous(slot: QueueDisplaySlot): string {
  return slot.donorFirstName ?? "an anonymous donor";
}

export function ChildSponsorBanner({
  childFirstName,
  active,
  queued,
  isFull,
}: Props) {
  if (!active) return null;

  const activeEnd = fmtDate(active.endDate);
  const next = queued[0] ?? null;
  const nextEnd = next ? fmtDate(next.endDate) : null;
  const final = queued[queued.length - 1] ?? null;
  const finalEnd = final ? fmtDate(final.endDate) : null;

  return (
    <section
      role="status"
      className="rounded-[20px] bg-moss-soft/50 border border-moss/30 px-6 py-5 max-md:px-5"
    >
      <div className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-moss-deep mb-2">
        Active monthly sponsorship
      </div>
      <div className="font-display text-[20px] text-ink leading-tight">
        {childFirstName} has a monthly sponsor.
      </div>
      <p className="mt-2 text-[14px] text-slate leading-[1.6]">
        Sponsored monthly{activeEnd ? ` until ${activeEnd}` : ""} by{" "}
        <NameOrAnon slot={active} />
        {next ? (
          <>
            , then by <NameOrAnon slot={next} accent />
            {nextEnd ? ` until ${nextEnd}` : ""}
          </>
        ) : null}
        .
        {queued.length > 1 ? (
          <>
            {" "}
            <span className="text-moss-deep">
              {queued.length - 1}{" "}
              {queued.length - 1 === 1 ? "more sponsor is" : "more sponsors are"}{" "}
              in queue.
            </span>
          </>
        ) : null}
        {isFull ? (
          <>
            {" "}
            <span className="text-moss-deep">
              Sponsor queue is full
              {finalEnd ? ` through ${finalEnd}` : ""}. You can still send a
              one-time gift today.
            </span>
          </>
        ) : finalEnd ? (
          <>
            {" "}
            You can support {childFirstName} from {finalEnd} onward.
          </>
        ) : null}
      </p>
    </section>
  );
}

function NameOrAnon({
  slot,
  accent = false,
}: {
  slot: QueueDisplaySlot;
  accent?: boolean;
}) {
  const name = nameOrAnonymous(slot);
  // Active sponsor renders in ink; queued renders in moss-deep so the
  // forward-looking nature is visually distinct.
  const cls = accent ? "text-moss-deep font-display" : "font-display text-ink";
  if (slot.donorFirstName) {
    return <span className={cls}>{slot.donorFirstName}</span>;
  }
  return <span className={cls}>{name}</span>;
}

export default ChildSponsorBanner;
