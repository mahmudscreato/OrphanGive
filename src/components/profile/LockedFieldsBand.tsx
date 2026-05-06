import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";
import {
  RevealCategoryCard,
  type RevealCategory,
} from "@/components/reveal/RevealCategoryCard";
import type { AllowedRevealField } from "@/lib/reveal-data";

// User-facing categories. Each maps to one or more encrypted fields on the
// child collection. The first field is the "primary" one tracked in
// reveal_request; the rest unlock together when primary is approved.
const CATEGORIES: RevealCategory[] = [
  {
    key: "address",
    label: "Full address",
    blurb: "Visible to sponsors after consent.",
    fields: ["full_address_encrypted"],
    iconKey: "location",
  },
  {
    key: "school",
    label: "School name",
    blurb: "Visible to sponsors after consent.",
    fields: ["school_name_encrypted"],
    iconKey: "school",
  },
  {
    key: "guardian",
    label: "Guardian details",
    blurb: "Visible to sponsors after consent.",
    fields: ["guardian_full_name_encrypted", "guardian_contact_encrypted"],
    iconKey: "guardian",
  },
  {
    key: "family",
    label: "Family circumstances",
    blurb: "Visible to sponsors after consent.",
    fields: ["family_circumstances_encrypted"],
    iconKey: "family",
  },
];

type Props = {
  child: ChildProfile;
  tier: ViewerTier;
  // Empty by default — defense in depth. Approved donor + active reveal
  // populates this; admin tier renders all encrypted values via a
  // separate code path that pre-fills `revealedValues` below.
  activeReveals?: ReadonlySet<AllowedRevealField>;
  // field_name → actual decrypted value, fetched server-side.
  revealedValues?: Partial<Record<AllowedRevealField, string | null>>;
  // field_name → ISO timestamp of approval (used for "Approved Nd ago" caption).
  revealedApprovedAt?: Partial<Record<AllowedRevealField, string | null>>;
};

export function LockedFieldsBand({
  child,
  tier,
  activeReveals = new Set(),
  revealedValues = {},
  revealedApprovedAt = {},
}: Props) {
  const childFirstName = child.display_name.split(" ")[0]!;
  const interactive = tier !== "public";
  const signInHref = `/signin?from=/children/${child.id}`;

  // Admin tier: pre-merge the encrypted block (already fetched in
  // getChildById) into revealedValues so admin sees everything without
  // having to set up reveals.
  const merged: Partial<Record<AllowedRevealField, string | null>> = {
    ...revealedValues,
  };
  if (tier === "admin" && child.encrypted) {
    merged.full_address_encrypted ??= child.encrypted.full_address;
    merged.school_name_encrypted ??= child.encrypted.school_name;
    merged.guardian_full_name_encrypted ??= child.encrypted.guardian_full_name;
    merged.guardian_contact_encrypted ??= child.encrypted.guardian_contact;
    merged.family_circumstances_encrypted ??=
      child.encrypted.family_circumstances;
  }

  return (
    <section className="px-6 py-16 bg-cream max-md:py-12">
      <div className="max-w-[1100px] mx-auto">
        <div className="max-w-[640px]">
          <div className="eyebrow-tag">Privacy by default</div>
          <h2 className="font-display font-normal mt-3 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,3.75vw,3rem)]">
            Some details stay <em className="italic text-tangerine">private</em>{" "}
            until you&apos;re a sponsor.
          </h2>
          <p className="mt-3 text-[16px] text-slate leading-[1.65]">
            We protect specifics that could put {childFirstName} at risk if
            they appeared online or in the wrong hands. Sponsors can request
            access individually — our safeguarding team reviews every request.
          </p>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:mt-6 max-md:gap-3">
          {CATEGORIES.map((category) => {
            const primary = category.fields[0]!;
            // We treat admin as having "active reveals" for everything.
            const isActive =
              tier === "admin" ||
              activeReveals.has(primary as AllowedRevealField);
            // Pull only the values relevant to this category (defense
            // in depth — don't spill another category's data here).
            const values: Partial<Record<AllowedRevealField, string | null>> = {};
            if (isActive) {
              for (const f of category.fields) {
                values[f] = merged[f] ?? null;
              }
            }
            return (
              <RevealCategoryCard
                key={category.key}
                category={category}
                childId={child.id}
                childFirstName={childFirstName}
                interactive={interactive}
                signInHref={signInHref}
                revealedValues={values}
                approvedAt={revealedApprovedAt[primary] ?? null}
              />
            );
          })}
        </div>

        <div className="mt-6 rounded-[20px] bg-moss-soft/60 border border-moss/20 px-6 py-5 flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-moss text-cream flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
              <path
                d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-[14px] text-ink/85 leading-[1.6]">
            This protects children from information being scraped or shared
            inappropriately. We grant access individually with admin approval —
            typically within 48 hours.
          </p>
        </div>
      </div>
    </section>
  );
}

export default LockedFieldsBand;
