// Generic renderer for CMS-authored static pages (Session 15a).
// Used by /about, /how-it-works, /for-charities, /stories, /faq —
// each route reads its `site_page` row by slug and hands the
// content here.
//
// Content authored in Directus is plain text/markdown (per
// site_page.content schema). For v1 we render as a vertical
// stack of paragraphs, splitting on blank lines. No markdown
// library — keep it minimal. If a row doesn't exist or has no
// body yet, render a graceful "Coming soon" so the route still
// resolves to a 200 instead of 404 (link from footer doesn't
// dead-end during the content-authoring window).

import Link from "next/link";
import type { SitePage } from "@/lib/site-page";

type Props = {
  page: SitePage | null;
  // Fallback heading + intro shown when the CMS row is missing.
  // Lets each route express its identity even before Mahmud
  // authors the row in Directus.
  fallback: {
    title: string;
    description: string;
  };
};

export function SitePageRenderer({ page, fallback }: Props) {
  const title = page?.title?.trim() || fallback.title;
  const body = page?.content?.trim() ?? "";
  const lastUpdatedLabel = formatMonthYear(page?.last_updated ?? null);

  return (
    <main className="bg-cream">
      <div className="px-6 pt-32 pb-24 max-md:pt-24 max-md:pb-16">
        <article className="max-w-[760px] mx-auto">
          <h1 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)] m-0">
            {title}
          </h1>
          {body ? (
            <ProseBody body={body} />
          ) : (
            <ComingSoon fallbackDescription={fallback.description} />
          )}
          {/* Session 15b2 batch 3 — "Last updated: May 2026" footer
              for CMS pages where the date field is set. Surfaced
              prominently on legal pages (donors expect that signal
              on privacy / terms / refund / cookies / safeguarding)
              but harmless on others. Hidden entirely when
              last_updated isn't set on the row. */}
          {lastUpdatedLabel ? (
            <p className="mt-16 pt-6 border-t border-ink/[0.08] font-mono text-[11.5px] tracking-[0.1em] text-slate-soft">
              Last updated: {lastUpdatedLabel}
            </p>
          ) : null}
        </article>
      </div>
    </main>
  );
}

// "May 2026"-style label. Returns null for missing / invalid input
// so the renderer can omit the footer cleanly. Format intentionally
// coarse — legal copy is rarely revised more than once a month and
// donors don't need day-level precision.
function formatMonthYear(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

// Splits the authored text into paragraphs on blank lines and
// renders each as a `<p>`. Lines starting with "## " become h2
// (subheadings) so authors can structure long pages with light
// markup. No deeper markdown — bold/italic/links can be added
// later if authors actually need them.
function ProseBody({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="mt-12 space-y-7 text-[19px] text-ink leading-[1.75]">
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <h2
              key={i}
              className="font-display text-[28px] text-ink leading-tight tracking-[-0.01em] mt-12 mb-2 max-md:text-[24px]"
            >
              {block.slice(3).trim()}
            </h2>
          );
        }
        if (block.startsWith("# ")) {
          return (
            <h2
              key={i}
              className="font-display text-[32px] text-ink leading-tight tracking-[-0.01em] mt-12 mb-2 max-md:text-[28px]"
            >
              {block.slice(2).trim()}
            </h2>
          );
        }
        return (
          <p key={i} className="m-0">
            {block}
          </p>
        );
      })}
    </div>
  );
}

function ComingSoon({ fallbackDescription }: { fallbackDescription: string }) {
  return (
    <div className="mt-10">
      <p className="text-[18px] text-slate leading-[1.6] m-0">
        {fallbackDescription}
      </p>
      <div className="mt-8 rounded-[16px] bg-tangerine-mist/40 border border-tangerine-soft px-5 py-4">
        <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-1">
          Coming soon
        </div>
        <p className="text-[14px] text-slate leading-[1.6] m-0">
          We&rsquo;re finalising this page. Check back shortly, or{" "}
          <Link
            href="/children"
            className="text-tangerine-deep underline-offset-4 hover:underline"
          >
            browse children awaiting a sponsor
          </Link>{" "}
          while you wait.
        </p>
      </div>
    </div>
  );
}
