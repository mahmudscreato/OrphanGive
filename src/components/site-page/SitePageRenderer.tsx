// Generic renderer for CMS-authored static pages (Session 15a;
// extended in 15b2 batch 4 to render WYSIWYG HTML safely).
// Used by /about, /how-it-works, /for-charities, /stories, /faq,
// and the 5 legal routes — each reads its `site_page` row by
// slug and hands the content here.
//
// Content authoring lives in Directus's WYSIWYG interface, which
// outputs raw HTML (<p>, <h2>, <a>, <strong>, lists, etc.). We
// inject that HTML via dangerouslySetInnerHTML — but pass it
// through DOMPurify first to strip anything dangerous (script /
// iframe / on* handlers / data-url tricks). The allow-list below
// is intentionally tight: text-content tags only, no media, no
// forms, no anchors that could escape the renderer's intent.
//
// Why DOMPurify over a markdown library: Directus's WYSIWYG is
// the authoring source of truth. Round-tripping through markdown
// would add a translation step + lose formatting nuance authors
// rely on. Sanitization-after-WYSIWYG keeps authoring frictionless
// without trusting the admin user's input absolutely.
//
// If the row doesn't exist or has no body yet, render a graceful
// "Coming soon" so the route still resolves to a 200 instead of
// 404 (link from footer doesn't dead-end during the content-
// authoring window).

import Link from "next/link";
import DOMPurify from "isomorphic-dompurify";
import type { SitePage } from "@/lib/site-page";

// Tags + attributes the WYSIWYG is allowed to emit. Everything
// else gets stripped silently (DOMPurify removes the tag and keeps
// the inner text, so authors who paste rich content from external
// sources still see their words even if the surrounding markup
// can't render here).
const ALLOWED_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "blockquote",
  "br",
  "hr",
  "code",
  "pre",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

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

// Renders WYSIWYG HTML through DOMPurify. The allow-list (above)
// gates which tags + attributes survive — anything off-list is
// stripped silently so authors who paste rich content from
// external sources still get their text content, just without
// the surrounding markup. Typography styling lives in
// `.prose-content` in globals.css.
function ProseBody({ body }: { body: string }) {
  const clean = DOMPurify.sanitize(body, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
  return (
    <div
      className="prose-content mt-12"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
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
