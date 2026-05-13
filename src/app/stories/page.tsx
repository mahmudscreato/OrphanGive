// Stories index. Lists published stories from the `story`
// collection (Session 15a). Empty-state copy lives inline so
// the route still resolves to a 200 with a graceful message
// while content authoring is in progress.

import Link from "next/link";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stories — OrphanGive",
  description:
    "Stories from sponsored children and their families — small moments, school progress, and the relationships that grow from a sponsorship.",
};

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
      <div className="px-6 pt-32 pb-24 max-md:pt-24 max-md:pb-16">
        <div className="max-w-[1100px] mx-auto">
          <header className="max-w-[760px]">
            <h1 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)] m-0">
              Stories
            </h1>
            <p className="mt-6 text-[18px] text-slate leading-[1.6] max-w-[640px]">
              Small moments from sponsored children&apos;s lives — school
              progress, family snapshots, the relationships that grow
              from a sponsorship.
            </p>
          </header>

          {stories.length === 0 ? (
            <div className="mt-16 max-w-[640px] rounded-[18px] bg-tangerine-mist/40 border border-tangerine-soft px-6 py-5">
              <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-1">
                Coming soon
              </div>
              <p className="text-[15px] text-slate leading-[1.65] m-0">
                We&rsquo;re working with sponsored children&apos;s
                families to share thoughtful, dignified updates.
                Real stories are on the way.
              </p>
              <p className="mt-3 text-[15px] text-slate leading-[1.65] m-0">
                <Link
                  href="/children"
                  className="text-tangerine-deeper underline-offset-4 hover:underline"
                >
                  Browse children awaiting a sponsor
                </Link>{" "}
                in the meantime.
              </p>
            </div>
          ) : (
            <ul className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
              {stories.map((s) => {
                const date = fmtDate(s.published_at);
                return (
                  <li key={s.id}>
                    <Link
                      href={`/stories/${s.slug}`}
                      className="group block rounded-[20px] bg-white border border-ink/[0.06] px-6 py-5 transition-all hover:shadow-warm hover:-translate-y-0.5"
                    >
                      <h2 className="font-display text-[24px] text-ink leading-tight tracking-[-0.01em] m-0 group-hover:text-tangerine-deeper transition-colors">
                        {s.title}
                      </h2>
                      {s.excerpt ? (
                        <p className="mt-3 text-[15px] text-slate leading-[1.6]">
                          {s.excerpt}
                        </p>
                      ) : null}
                      <div className="mt-4 font-mono text-[10.5px] tracking-[0.12em] uppercase text-slate-soft">
                        {[s.byline, date].filter(Boolean).join(" · ")}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
