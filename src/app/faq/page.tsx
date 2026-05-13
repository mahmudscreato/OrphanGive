// FAQ page (Session 15a). Renders questions from the dedicated
// `faq` collection — distinct from `site_page` because FAQ is
// inherently structured (category + question + answer with
// ordering). Authoring lives in Directus admin; updates go live
// without a redeploy.

import Link from "next/link";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FAQ — OrphanGive",
  description:
    "Answers to common questions about sponsoring a child through OrphanGive — payments, updates, the organisation, and your account.",
};

type FaqRow = {
  id: string;
  category: string | null;
  question: string;
  answer: string;
  display_order: number | null;
  active: boolean | null;
};

async function getActiveFaqs(): Promise<FaqRow[]> {
  try {
    const rows = (await directusServer().request(
      readItems("faq" as never, {
        filter: { active: { _eq: true } },
        fields: ["id", "category", "question", "answer", "display_order", "active"],
        sort: ["category", "display_order"],
        limit: 200,
      } as never),
    )) as unknown as FaqRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function groupByCategory(rows: FaqRow[]): Map<string, FaqRow[]> {
  const out = new Map<string, FaqRow[]>();
  for (const r of rows) {
    const cat = r.category?.trim() || "General";
    const arr = out.get(cat) ?? [];
    arr.push(r);
    out.set(cat, arr);
  }
  return out;
}

export default async function FaqPage() {
  const rows = await getActiveFaqs();
  const grouped = groupByCategory(rows);

  return (
    <div className="bg-cream">
      <div className="px-6 pt-32 pb-24 max-md:pt-24 max-md:pb-16">
        <div className="max-w-[820px] mx-auto">
          <header>
            <h1 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)] m-0">
              Frequently asked questions
            </h1>
            <p className="mt-6 text-[18px] text-slate leading-[1.6] max-w-[640px]">
              Answers to the questions donors ask most often. If
              yours isn&rsquo;t here,{" "}
              <a
                href="mailto:hello@orphangive.org"
                className="text-tangerine-deeper underline-offset-4 hover:underline"
              >
                drop us a note
              </a>
              .
            </p>
          </header>

          {rows.length === 0 ? (
            <div className="mt-16 rounded-[18px] bg-tangerine-mist/40 border border-tangerine-soft px-6 py-5">
              <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-1">
                Coming soon
              </div>
              <p className="text-[15px] text-slate leading-[1.65] m-0">
                We&rsquo;re finalising answers to common questions.
                Check back shortly, or{" "}
                <Link
                  href="/children"
                  className="text-tangerine-deeper underline-offset-4 hover:underline"
                >
                  browse children awaiting a sponsor
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="mt-14 space-y-12">
              {Array.from(grouped.entries()).map(([cat, items]) => (
                <section key={cat}>
                  <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-tangerine-deep mb-4">
                    {cat}
                  </h2>
                  <ul className="space-y-3">
                    {items.map((item) => (
                      <li key={item.id}>
                        <details className="group rounded-[14px] bg-white border border-ink/[0.06] px-5 py-4 transition-colors open:bg-white/95">
                          <summary className="cursor-pointer list-none flex items-baseline gap-3 font-display text-[18px] text-ink leading-snug">
                            <span className="font-mono text-[14px] text-tangerine-deeper shrink-0 transition-transform group-open:rotate-45">
                              +
                            </span>
                            {item.question}
                          </summary>
                          <div className="mt-3 pl-7 text-[15.5px] text-slate leading-[1.7] whitespace-pre-line">
                            {item.answer}
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
