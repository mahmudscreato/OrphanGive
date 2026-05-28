// P3 — single story article route. Companion to /stories listing.
//
// Source: Directus `story` collection (id, title, slug, excerpt,
// content, cover_image, byline, published_at, status, tags). The
// collection has NO foreign key to `child` — stories are stand-alone
// content. If an author's story body mentions a child by name, that
// is a CONTENT review concern (handled in the author workflow), not
// a structural privacy boundary. The tier-projection model that
// protects /children/[id] doesn't apply here because no Tier-2/3
// child fields are queried — only the story row itself.
//
// Author convention (enforced via copy review, not code):
//   - First name only when referencing a sponsored child.
//   - Never the child's full name, district, school name, guardian
//     name, exact address, or DOB.
//   - Cover image: a guardian-consented photo, EXIF stripped on
//     upload (see src/lib/image-metadata-strip.ts).
//
// Routes:
//   GET /stories/<slug>          → renders the article (status='published')
//   draft/scheduled/etc.         → 404 (the WHERE filter excludes them)
//   missing slug                 → 404
//
// Empty state: when no story matches the slug (incl. empty `story`
// collection on day-1), Next.js renders the standard not-found page.

import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { readItems } from "@directus/sdk";
import { ChevronLeft } from "lucide-react";
import { directusServer } from "@/lib/directus";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

type Story = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  cover_image: string | null;
  byline: string | null;
  published_at: string | null;
  tags: string[] | string | null;
};

// Same fields shape used by both generateMetadata and the page body
// so a single Directus read covers both paths in the request cycle.
const STORY_FIELDS = [
  "id",
  "slug",
  "title",
  "excerpt",
  "content",
  "cover_image",
  "byline",
  "published_at",
  "tags",
] as const;

async function getStoryBySlug(slug: string): Promise<Story | null> {
  // Slug shape check — a-z0-9-_. Reject early so bad input never
  // reaches Directus.
  if (!slug || !/^[a-z0-9][a-z0-9\-_]{0,200}$/i.test(slug)) {
    return null;
  }
  try {
    const rows = (await directusServer().request(
      readItems("story" as never, {
        filter: {
          _and: [{ slug: { _eq: slug } }, { status: { _eq: "published" } }],
        },
        fields: [...STORY_FIELDS],
        limit: 1,
      } as never),
    )) as unknown as Story[] | undefined;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
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

// Lightweight HTML-to-paragraphs renderer for the story body.
// Stories' `content` column is plain text or basic HTML (Directus
// rich-text). To keep this surface safe + simple, we render line-
// separated paragraphs and let the author use simple line breaks.
// Anything richer (links, embeds) can be added later through a
// proper sanitizer; for v1, prose-only is sufficient.
function renderBody(content: string | null) {
  if (!content) return null;
  // Strip any HTML tags defensively (we don't want to inject
  // arbitrary markup into the donor-facing surface).
  const stripped = content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  const paragraphs = stripped
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return paragraphs.map((p, i) => (
    <p key={i} className="text-[17px] text-ink leading-[1.75]">
      {p}
    </p>
  ));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) {
    return buildPageMetadata({
      path: `/stories/${slug}`,
      title: "Story not found",
      description: "This story isn't available.",
    });
  }
  // OG / twitter title + description from the story's own title +
  // excerpt. No child / Tier-3 data — the underlying row has none to
  // surface. The author copy is the privacy contract here.
  return buildPageMetadata({
    path: `/stories/${story.slug}`,
    title: story.title,
    description:
      story.excerpt?.trim() ||
      "A story from sponsored children and their families.",
  });
}

export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) notFound();

  const date = fmtDate(story.published_at);
  const coverUrl = story.cover_image ? `/api/assets/${story.cover_image}` : null;
  const tags = Array.isArray(story.tags)
    ? story.tags
    : typeof story.tags === "string" && story.tags.trim()
      ? story.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

  return (
    <div className="bg-cream">
      <div className="px-6 pt-20 pb-24 max-md:pt-14 max-md:pb-16">
        <article className="max-w-[760px] mx-auto">
          {/* Back link */}
          <Link
            href="/stories"
            className="inline-flex items-center gap-1 text-[13.5px] text-slate hover:text-tangerine-deeper transition-colors mb-6"
          >
            <ChevronLeft
              className="w-4 h-4 stroke-[1.75]"
              aria-hidden="true"
            />
            All stories
          </Link>

          {/* Header */}
          <header className="mb-8 md:mb-10">
            <h1 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4.5vw,3.25rem)] m-0">
              {story.title}
            </h1>
            {story.byline || date ? (
              <div className="mt-5 font-mono text-[11px] tracking-[0.14em] uppercase text-slate-soft">
                {[story.byline, date].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </header>

          {/* Cover image (optional) */}
          {coverUrl ? (
            <figure className="mb-8 md:mb-10">
              <div className="relative w-full aspect-[16/9] overflow-hidden rounded-[18px] bg-tangerine-mist">
                <Image
                  src={coverUrl}
                  alt={story.title}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 760px"
                  className="object-cover"
                />
              </div>
            </figure>
          ) : null}

          {/* Excerpt as a pull-quote (when present) */}
          {story.excerpt?.trim() ? (
            <p className="mb-8 font-script italic text-[22px] text-tangerine-deeper leading-[1.5]">
              {story.excerpt.trim()}
            </p>
          ) : null}

          {/* Body */}
          <div className="space-y-5">{renderBody(story.content)}</div>

          {/* Tags + footer */}
          {tags.length > 0 ? (
            <div className="mt-10 flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-tangerine-mist text-tangerine-deeper text-[11px] font-medium tracking-wider uppercase"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          {/* CTA back to children browse */}
          <div className="mt-12 pt-8 border-t border-ink/[0.08]">
            <p className="text-[15px] text-slate leading-[1.6]">
              Inspired by this story?{" "}
              <Link
                href="/children"
                className="text-tangerine-deeper underline-offset-4 hover:underline font-medium"
              >
                Meet the children waiting for a sponsor →
              </Link>
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
