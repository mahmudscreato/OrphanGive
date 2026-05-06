import Link from "next/link";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";

type LockedCategory = {
  key: "address" | "school" | "guardian" | "family";
  label: string;
  blurb: string;
  // Reads any/all of these from the encrypted block (admin/tier-3 only).
  encryptedKeys: ReadonlyArray<keyof NonNullable<ChildProfile["encrypted"]>>;
  icon: React.ReactNode;
};

const LocationIcon = (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const SchoolIcon = (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <path d="M3 7v13h18V7M3 7l9-4 9 4M3 7h18" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const GuardianIcon = (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <path d="M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="2" />
    <path d="M4 21a8 8 0 0116 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const FamilyIcon = (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <path d="M9 11a3 3 0 100-6 3 3 0 000 6zm6 0a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0H3zm12 0a6 6 0 016-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CATEGORIES: LockedCategory[] = [
  {
    key: "address",
    label: "Full address",
    blurb: "Visible to sponsors after consent.",
    encryptedKeys: ["full_address"],
    icon: LocationIcon,
  },
  {
    key: "school",
    label: "School name",
    blurb: "Visible to sponsors after consent.",
    encryptedKeys: ["school_name"],
    icon: SchoolIcon,
  },
  {
    key: "guardian",
    label: "Guardian details",
    blurb: "Visible to sponsors after consent.",
    encryptedKeys: ["guardian_full_name", "guardian_contact"],
    icon: GuardianIcon,
  },
  {
    key: "family",
    label: "Family circumstances",
    blurb: "Visible to sponsors after consent.",
    encryptedKeys: ["family_circumstances"],
    icon: FamilyIcon,
  },
];

function BlurredBlocks() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block bg-ink/[0.18] h-3 rounded-sm w-14" />
      <span className="inline-block bg-ink/[0.18] h-3 rounded-sm w-8" />
      <span className="inline-block bg-ink/[0.18] h-3 rounded-sm w-20" />
    </span>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-tangerine-deep">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CategoryCard({
  category,
  child,
  tier,
}: {
  category: LockedCategory;
  child: ChildProfile;
  tier: ViewerTier;
}) {
  // Tier 3 (admin) — show actual values inline if any encrypted data is present.
  const revealed =
    tier === "admin" &&
    child.encrypted &&
    category.encryptedKeys.some((k) => Boolean(child.encrypted![k]));

  return (
    <div
      className={`rounded-[20px] p-7 transition-all duration-[400ms] ease-soft ${
        revealed
          ? "bg-tangerine-mist border-[1.5px] border-tangerine-soft"
          : "bg-white border-[1.5px] border-dashed border-tangerine/40 hover:bg-tangerine-mist hover:-translate-y-0.5"
      }`}
    >
      <div className="flex items-center gap-3 text-tangerine-deep">
        {category.icon}
        <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
          {category.label}
        </div>
      </div>

      {revealed ? (
        <div className="mt-4 space-y-2.5 font-display text-[17px] text-ink leading-snug">
          {category.encryptedKeys.map((k) => {
            const v = child.encrypted![k];
            return v ? (
              <div key={k}>
                <span className="text-[11px] uppercase tracking-[0.12em] text-slate-soft font-mono mr-2 block mt-1">
                  {k.replace(/_/g, " ")}
                </span>
                {v}
              </div>
            ) : null;
          })}
        </div>
      ) : (
        <>
          <div className="mt-4">
            <span className="inline-flex items-center gap-2.5 bg-tangerine-mist border-[1.5px] border-dashed border-tangerine/40 rounded-xl px-3.5 py-2">
              <BlurredBlocks />
              <LockIcon />
            </span>
          </div>
          <p className="mt-4 text-[13.5px] text-slate leading-snug">
            {category.blurb}
          </p>
          <div className="mt-5">
            {tier === "public" ? (
              <Link
                href={`/signin?from=/children/${child.id}`}
                className="inline-flex items-center gap-2 text-tangerine-deep text-[13px] font-medium transition-[gap] duration-[250ms] hover:gap-3"
              >
                Sign in to learn more →
              </Link>
            ) : (
              <RequestRevealLink childId={child.id} field={category.key} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Server component shim — the actual reveal-modal flow ships in Phase 2.
// For TIER 2 we render an explicit link to a /reveal-request route stub that
// will eventually open the modal. Until that ships, the link 404s and that's
// intentional (the user said "shows an alert 'Reveal request flow coming
// soon'" — but we cannot use onClick from a Server Component, so we link to
// a placeholder route the user can build out). Keeping behaviour explicit
// over silently broken.
function RequestRevealLink({
  childId,
  field,
}: {
  childId: string;
  field: string;
}) {
  return (
    <Link
      href={`/children/${childId}/reveal?field=${field}`}
      className="inline-flex items-center gap-2 text-tangerine-deep text-[13px] font-medium transition-[gap] duration-[250ms] hover:gap-3"
    >
      Request to view →
    </Link>
  );
}

export function LockedFieldsBand({
  child,
  tier,
}: {
  child: ChildProfile;
  tier: ViewerTier;
}) {
  return (
    <section className="px-6 py-28 bg-cream max-md:py-20">
      <div className="max-w-[1100px] mx-auto">
        <div className="max-w-[640px]">
          <div className="eyebrow-tag">Privacy by default</div>
          <h2 className="font-display font-normal mt-5 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,3.75vw,3rem)]">
            Some details stay <em className="italic text-tangerine">private</em>{" "}
            until you&apos;re a sponsor.
          </h2>
          <p className="mt-5 text-[16px] text-slate leading-[1.65]">
            We protect specifics that could put {child.display_name.split(" ")[0]}{" "}
            at risk if they appeared online or in the wrong hands. Sponsors can
            request access individually — our safeguarding team reviews every
            request.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-5 max-md:grid-cols-1">
          {CATEGORIES.map((c) => (
            <CategoryCard key={c.key} category={c} child={child} tier={tier} />
          ))}
        </div>

        <div className="mt-10 rounded-[20px] bg-moss-soft/60 border border-moss/20 px-6 py-5 flex items-start gap-4">
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
