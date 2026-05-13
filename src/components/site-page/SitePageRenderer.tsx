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
import { marked } from "marked";
import type { SitePage } from "@/lib/site-page";

// Tags + attributes the WYSIWYG is allowed to emit. Everything
// else gets stripped silently (DOMPurify removes the tag and keeps
// the inner text, so authors who paste rich content from external
// sources still see their words even if the surrounding markup
// can't render here).
//
// table/thead/tbody/tr/th/td are included because marked emits
// them for GFM-style tables. The wider HTML payload still goes
// through DOMPurify so the table allow doesn't widen the attack
// surface meaningfully.
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
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

// Lines whose trimmed prefix matches this pattern are markdown
// syntax (headings, list items, blockquotes, code fences). When
// Directus's WYSIWYG wraps such lines in <p>…</p>, the syntax is
// preserved but invisible to marked unless we unwrap first. See
// ProseBody below for the full preprocessing pipeline.
const MARKDOWN_LINE_PREFIX = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)/;

// Minimal HTML entity decoder. WYSIWYG editors encode em/en
// dashes, quotes, &amp;, etc. when wrapping content; marked
// happily renders those as literal entity strings if we don't
// decode first. Order matters: &amp; last so we don't double-
// decode a string that contained &amp;amp;.
function decodeBasicEntities(s: string): string {
  return s
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&amp;/g, "&");
}

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

// Renders authored content via the WYSIWYG-aware markdown
// pipeline. Pipeline order:
//
//   1. Unwrap WYSIWYG <p>...</p> wrappers around lines whose
//      trimmed prefix is markdown syntax (##, -, *, 1., >, ```).
//      Directus's editor preserves the syntax characters but
//      buries them inside <p> tags, which marked then refuses
//      to interpret. Unwrapping converts back to raw markdown
//      that marked can parse. Real prose paragraphs (no leading
//      syntax) stay wrapped — we don't want to flatten authored
//      structure.
//
//   2. Convert <br> inside the unwrapped runs to newline. WYSIWYG
//      sometimes uses <br> as a soft break inside what should
//      be list-item markup; marked needs newlines, not breaks.
//
//   3. Decode common HTML entities (em-dash, smart quotes, &amp;).
//      Marked would otherwise emit them as literal strings.
//
//   4. marked.parse → HTML.
//
//   5. DOMPurify sanitize with the same allow-list as before.
//
//   6. Render via dangerouslySetInnerHTML on `.prose-content`.
//
// Idempotent: content that's already pure HTML (no markdown syntax)
// passes through unchanged because step 1 finds no matches; marked
// then sees HTML and emits HTML unchanged.
function ProseBody({ body }: { body: string }) {
  // Step 1: strip <p>...</p> wrappers when ANY line inside the
  // block matches markdown syntax. Earlier versions only checked
  // the trimmed start of the block, which missed the common
  // Directus WYSIWYG pattern where a single <p> wraps a mixed
  // run of prose + headings + lists pasted as plain text:
  //
  //   <p>Some intro paragraph...
  //   ## Heading
  //   When the user does X...
  //   - Bullet one
  //   - Bullet two</p>
  //
  // The line-anywhere check correctly identifies this block as
  // markdown-bearing and unwraps the whole thing. Pure-prose
  // paragraphs (no markdown syntax on any line) stay wrapped.
  const unwrapped = body.replace(/<p>([\s\S]*?)<\/p>/g, (match, inner) => {
    const decoded = decodeBasicEntities(inner);
    const hasMarkdownLine = decoded
      .split("\n")
      .some((line) => MARKDOWN_LINE_PREFIX.test(line.trim()));
    if (hasMarkdownLine) {
      // Trailing blank line so adjacent unwrapped blocks don't
      // glue together into a single markdown chunk by accident.
      return `${decoded}\n\n`;
    }
    return match;
  });

  // Step 2: <br> → newline (helps WYSIWYG soft-break content
  // collapse into proper markdown lists / paragraphs).
  const withNewlines = unwrapped.replace(/<br\s*\/?>/gi, "\n");

  // Step 3: decode entities for any text still outside paragraphs.
  const decoded = decodeBasicEntities(withNewlines);

  // Step 4: normalize block-element spacing. Markdown's block
  // grammar requires a blank line BEFORE and AFTER headings, list
  // starts, and blockquotes. WYSIWYG editors strip blank lines on
  // save, so a multi-line block coming out of step 1 will have
  // its block-level elements butted up against surrounding prose.
  // Marked then misreads "prose\n## heading" as a single
  // paragraph containing literal '##' characters. The regex chain
  // restores the blank-line shape marked expects.
  //
  // Each pass uses a negative-prefix lookbehind to avoid stacking
  // blank lines (we don't want "\n\n\n## foo" → "\n\n\n\n## foo").
  // The final \n{3,} → \n\n collapse cleans up any over-padding.
  const normalized = decoded
    // Trim trailing whitespace per line; preserve leading indent
    // (matters for nested list parsers).
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    // Blank line BEFORE a heading
    .replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2")
    // Blank line AFTER a heading
    .replace(/(^|\n)(#{1,6}\s[^\n]+)\n([^\n#])/g, "$1$2\n\n$3")
    // Blank line BEFORE the start of a bullet list (previous line
    // is neither blank nor another list item)
    .replace(/([^\n\-*+])\n([-*+]\s)/g, "$1\n\n$2")
    // Blank line AFTER the end of a bullet list (next line is
    // neither blank, another list item, nor leading-space
    // continuation)
    .replace(/(\n[-*+]\s[^\n]+)\n([^\n\-*+\s])/g, "$1\n\n$2")
    // Blank line BEFORE a numbered list item
    .replace(/([^\n])\n(\d+\.\s)/g, "$1\n\n$2")
    // Blank line BEFORE a blockquote
    .replace(/([^\n>])\n(>\s)/g, "$1\n\n$2")
    // Collapse 3+ consecutive newlines back to a single blank line
    .replace(/\n{3,}/g, "\n\n");

  // Step 5: parse markdown → HTML. async:false guarantees a
  // synchronous string return so we can sanitize in the same tick.
  const html = marked.parse(normalized, {
    async: false,
    gfm: true,
    breaks: false,
  }) as string;

  // Step 6: sanitize.
  const clean = DOMPurify.sanitize(html, {
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
            className="text-tangerine-deeper underline-offset-4 hover:underline"
          >
            browse children awaiting a sponsor
          </Link>{" "}
          while you wait.
        </p>
      </div>
    </div>
  );
}
