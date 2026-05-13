// Session 20 — Stories index, brand-aligned with Session 16 design.
//
// Stories feature is Phase 7 of the roadmap (content publishing
// with guardian consent). Until then, the page renders a dignified
// coming-soon block + an opt-in form (UI only) + a closing strip.
// If the `story` collection ever returns published rows, the
// listing path below picks them up automatically — no further
// page-level change required.

import Link from "next/link";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { buildPageMetadata } from "@/lib/page-metadata";
import { StoriesNewsletterForm } from "./StoriesNewsletterForm";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  path: "/stories",
  title: "Stories",
  description:
    "Stories from sponsored children, published only with explicit consent from their guardians.",
});

type Story = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  byline: string | null;
  published_at: string | null;
};

async function getPublishedStories(): Promise<Story[]> {
  try {
    const rows = (await directusServer().request(
      readItems("story" as never, {
        filter: { status: { _eq: "published" } },
        fields: ["id", "slug", "title", "excerpt", "byline", "published_at"],
        sort: ["-published_at"],
        limit: 50,
      } as never),
    )) as unknown as Story[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function StoriesIndexPage() {
  const stories = await getPublishedStories();

  return (
    <div className="bg-cream">
      {/* Page header — eyebrow + dual-font headline + sub-copy. */}
      <header className="px-6 pt-20 pb-12 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[860px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Stories
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              Real stories.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              Soon to come.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft leading-[1.65]">
            Stories from sponsored children are published only with
            explicit consent from their guardians. We&apos;re building
            this carefully — every update will protect the child&apos;s
            privacy and dignity first.
          </p>
        </div>
      </header>

      {stories.length === 0 ? (
        <>
          {/* Coming-soon block + newsletter signup. */}
          <section className="px-6 pb-16 max-md:pb-12">
            <div className="max-w-[720px] mx-auto rounded-[28px] border border-ink/[0.06] bg-white px-10 py-12 max-md:px-6 max-md:py-10 shadow-md">
              <div className="text-center">
                <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-tangerine-deep mb-3">
                  Coming soon
                </div>
                <h2 className="font-display font-semibold text-2xl text-ink leading-tight max-w-[560px] mx-auto">
                  When ready, this page will share progress updates
                  from the children OrphanGive supports.
                </h2>
                <p className="mt-4 max-w-md mx-auto text-base text-ink-soft leading-relaxed">
                  Stories will be published only with explicit consent
                  from their guardians, and will respect each
                  child&apos;s privacy and dignity.
                </p>
              </div>

              <div className="mt-8 pt-8 border-t border-ink/[0.06]">
                <p className="text-center text-sm text-ink-soft mb-5">
                  Want to know when the first stories arrive?
                </p>
                <StoriesNewsletterForm />
              </div>
            </div>
          </section>

          {/* Closing strip. */}
          <section className="px-6 py-12 max-md:py-10">
            <div className="max-w-[860px] mx-auto text-center">
              <p className="text-base text-ink-soft leading-relaxed">
                In the meantime,{" "}
                <Link
                  href="/children"
                  className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
                >
                  meet the children →
                </Link>
              </p>
            </div>
          </section>
        </>
      ) : (
        // Listing path — preserved from the legacy page. If/when
        // Directus returns published stories, they render here in a
        // 2-col grid. Brand-aligned card chrome.
        <section className="px-6 pb-20 max-md:pb-14">
          <div className="max-w-[1100px] mx-auto">
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {stories.map((s) => {
                const date = fmtDate(s.published_at);
                return (
                  <li key={s.id}>
                    <Link
                      href={`/stories/${s.slug}`}
                      className="group block rounded-[28px] bg-white border border-ink/[0.06] px-7 py-6 transition-all hover:shadow-warm hover:-translate-y-0.5"
                    >
                      <h2 className="font-display font-semibold text-2xl text-ink leading-tight tracking-[-0.01em] m-0 group-hover:text-tangerine-deep transition-colors">
                        {s.title}
                      </h2>
                      {s.excerpt ? (
                        <p className="mt-3 text-base text-ink-soft leading-[1.6]">
                          {s.excerpt}
                        </p>
                      ) : null}
                      <div className="mt-4 font-mono text-[10.5px] tracking-[0.12em] uppercase text-ink-soft">
                        {[s.byline, date].filter(Boolean).join(" · ")}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
