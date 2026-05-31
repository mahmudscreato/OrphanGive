import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/profile/Reveal";
import type { ViewerTier } from "@/lib/child-profile-data";

// ─── Story teaser — "follow along" invitation ──────────────────────
//
// PRIVACY POSTURE (load-bearing — read before editing):
//   This section NEVER receives or renders real Tier-2 / Tier-3
//   content. It takes only the child's id, first name, the viewer's
//   tier, and an isSponsor boolean. Every string it renders is static
//   invitation copy + the public first name. There is therefore NO
//   gated value present in the page source for a logged-out viewer —
//   not behind a blur, not in a hidden node, not anywhere. The "more"
//   it advertises is described generically (photo updates, letters,
//   progress reports) and the real content lives in the OTHER,
//   already-tier-gated sections (UpdatesSection, MomentsGallery, the
//   reveal-request cards in LockedFieldsBand).
//
//   It gates purely on the EXISTING `tier` signal (getViewerTier) plus
//   the page's existing `isSponsor` check. No new tier mechanism.
//
// Copy by viewer:
//   - public (logged out)        → invitation to sign in / sponsor
//   - authed donor, not sponsor  → invitation to sponsor THIS child
//   - sponsor (or admin)         → warm "you're following along"
//                                  acknowledgement, no CTA
//
// Visual: a warm, inviting frosted card in OG tokens — an invitation,
// not a hard paywall.

const FOLLOW_ITEMS: { key: string; label: string; blurb: string }[] = [
  {
    key: "updates",
    label: "Photo updates",
    blurb: "Moments from the field as the year unfolds.",
  },
  {
    key: "letters",
    label: "Letters & notes",
    blurb: "Personal messages shared with sponsors.",
  },
  {
    key: "progress",
    label: "Progress reports",
    blurb: "How school, health, and care are going.",
  },
];

function FollowIcon({ kind }: { kind: string }) {
  const common = "w-5 h-5 text-tangerine-deep";
  if (kind === "updates") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="8.5" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 17l4.5-4 3 2.5L16 11l4 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "letters") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 15l3.5-4 3 2.5L20 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StoryTeaser({
  childId,
  childFirstName,
  tier,
  isSponsor,
}: {
  childId: string;
  childFirstName: string;
  tier: ViewerTier;
  isSponsor: boolean;
}) {
  // Already following: a sponsor (or admin, who sees everything). Show
  // a warm acknowledgement, not a sell — the real updates render above.
  const alreadyFollowing = isSponsor || tier === "admin";

  const heading = alreadyFollowing
    ? `You're following ${childFirstName}'s journey.`
    : `There's more to ${childFirstName}'s story.`;

  const body = alreadyFollowing
    ? `New photo updates, letters, and progress reports appear here as they're shared. Thank you for walking alongside ${childFirstName}.`
    : `Sponsors follow along as the year unfolds — photo updates from the field, personal letters, and reports on how ${childFirstName} is doing. It's a real, ongoing relationship.`;

  return (
    <section className="px-6 py-16 bg-cream max-md:py-12">
      <div className="max-w-[1100px] mx-auto">
        <Reveal>
          <div className="relative overflow-hidden rounded-[28px] border border-tangerine/15 bg-gradient-to-br from-tangerine-mist to-cream px-8 py-10 max-md:px-6 max-md:py-8 shadow-[0_2px_4px_rgba(42,42,44,0.05),0_16px_40px_-16px_rgba(42,42,44,0.12)]">
            <div
              className="logo-motif"
              aria-hidden="true"
              style={{
                top: -80,
                right: -80,
                width: 360,
                height: 360,
                opacity: 0.05,
                transform: "rotate(12deg)",
              }}
            />
            <div className="relative grid grid-cols-[1fr_auto] gap-10 items-center max-lg:grid-cols-1 max-lg:gap-8">
              <div className="max-w-[560px]">
                <div className="eyebrow-tag">Stay close</div>
                <h2 className="font-display font-normal mt-3 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(1.85rem,3.5vw,2.85rem)]">
                  {alreadyFollowing ? (
                    heading
                  ) : (
                    <>
                      There&apos;s more to{" "}
                      <em className="italic text-tangerine-deep">
                        {childFirstName}&apos;s
                      </em>{" "}
                      story.
                    </>
                  )}
                </h2>
                <p className="mt-4 text-[16px] text-slate leading-[1.65] max-w-[480px]">
                  {body}
                </p>

                {!alreadyFollowing ? (
                  <div className="mt-7 flex gap-3.5 items-center flex-wrap">
                    {tier === "public" ? (
                      <Button
                        href={`/signin?from=/children/${childId}`}
                        variant="tangerine"
                        size="lg"
                      >
                        Sign in or sponsor to follow along →
                      </Button>
                    ) : (
                      <Button
                        href={`/sponsor/${childId}`}
                        variant="tangerine"
                        size="lg"
                      >
                        Sponsor {childFirstName} to follow along →
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Generic "what you'll follow" list — static copy only,
                  no real child data. */}
              <ul className="flex flex-col gap-3 w-[300px] max-lg:w-full">
                {FOLLOW_ITEMS.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-start gap-3.5 bg-white/70 border border-ink/[0.06] rounded-2xl px-4 py-3.5"
                  >
                    <span className="w-9 h-9 rounded-xl bg-tangerine-soft/60 flex items-center justify-center shrink-0">
                      <FollowIcon kind={item.key} />
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="font-display text-[15px] text-ink font-medium">
                        {item.label}
                      </span>
                      <span className="text-[12.5px] text-slate leading-[1.45] mt-0.5">
                        {item.blurb}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default StoryTeaser;
