// Public-page banner showing whether a child currently has an active
// monthly sponsor (Session 14.6). Two visual states:
//
//   • Sponsored — banner reads "Sponsored by [first name]" or
//     "Sponsored by anonymous donor", depending on the donor's
//     visibility choice on their sponsorship row.
//   • Open — banner is omitted entirely; the page surfaces the usual
//     sponsor CTA elsewhere.
//
// We intentionally never expose the donor's last name, email, donor id,
// or any other identifier — only the donor-controlled first name when
// they opted IN. labelForVisibility / effectiveVisibility apply the
// privacy-preserving fallback (null/legacy → anonymous).
//
// This is a pure presentational component. Lock state + donor first
// name are resolved server-side via getActiveMonthlySponsorForChild
// and passed in as props.

import type { VisibilityEnum } from "@/lib/visibility";
import { effectiveVisibility } from "@/lib/visibility";

type Props = {
  // The child's first name only — used in the headline copy ("X has a
  // monthly sponsor"). Never exposes last name.
  childFirstName: string;
  // The donor's chosen visibility on this active monthly sponsorship.
  // null is treated as anonymous (legacy rows pre-14.6).
  visibility: VisibilityEnum | string | null;
  // Sponsor's first name. Only rendered when visibility==='named' AND
  // a name is actually present. Even when present we only ever show
  // the first name.
  sponsorFirstName: string | null;
};

export function ChildSponsorBanner({
  childFirstName,
  visibility,
  sponsorFirstName,
}: Props) {
  const v = effectiveVisibility(visibility);
  const showName = v === "named" && Boolean(sponsorFirstName);

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
        {showName ? (
          <>
            Sponsored by{" "}
            <span className="font-display text-ink">{sponsorFirstName}</span>.
          </>
        ) : (
          <>Sponsored by an anonymous donor.</>
        )}{" "}
        You can still send a one-time gift to support {childFirstName}.
      </p>
    </section>
  );
}

export default ChildSponsorBanner;
