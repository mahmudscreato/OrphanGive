// Renders the donor's active / pending / paused sponsorships.
// Returns null if the array is empty so the dashboard can fall back to
// EmptyDonorState. Data is fetched once at the page level via
// getDonorSponsorships() and passed in as `items`.

import Link from "next/link";
import { formatUsd } from "@/lib/pricing";
import type { Sponsorship } from "@/lib/sponsorship-data";

type DisplayStatus = "active" | "pending_payment" | "paused";

const STATUS_ORDER: DisplayStatus[] = ["active", "pending_payment", "paused"];

const STATUS_PILL: Record<DisplayStatus, string> = {
  active:          "bg-moss-soft text-moss border-moss/30",
  pending_payment: "bg-tangerine-mist text-tangerine-deep border-tangerine-soft",
  paused:          "bg-sky/30 text-sky border-sky/40",
};

const STATUS_LABEL: Record<DisplayStatus, string> = {
  active:          "Active",
  pending_payment: "Pending payment",
  paused:          "Paused",
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function childOf(s: Sponsorship): { id: string; display_name: string | null } | null {
  if (!s.child) return null;
  if (typeof s.child === "string") return { id: s.child, display_name: null };
  return { id: s.child.id, display_name: s.child.display_name ?? null };
}

export function isDisplaySponsorship(
  s: Sponsorship,
): s is Sponsorship & { status: DisplayStatus } {
  return (
    s.status === "active" ||
    s.status === "pending_payment" ||
    s.status === "paused"
  );
}

export function SponsorshipsSection({ items }: { items: Sponsorship[] }) {
  const display = items.filter(isDisplaySponsorship);
  if (display.length === 0) return null;

  return (
    <section>
      <div className="max-w-[640px]">
        <div className="eyebrow-tag">Sponsorships</div>
        <h2 className="font-display font-normal mt-3 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(1.75rem,3.25vw,2.5rem)]">
          Your sponsorships.
        </h2>
      </div>
      <ul className="mt-7 space-y-3">
        {STATUS_ORDER.flatMap((status) => {
          const filtered = display.filter((i) => i.status === status);
          return filtered.map((s) => {
            const child = childOf(s);
            return (
              <li
                key={s.id}
                className="rounded-[18px] bg-white border border-ink/[0.06] px-5 py-4 flex items-center justify-between gap-4 flex-wrap max-md:flex-col max-md:items-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] text-ink">
                    {child?.id ? (
                      <Link
                        href={`/children/${child.id}`}
                        className="font-medium hover:text-tangerine-deep transition-colors underline-offset-4 hover:underline"
                      >
                        {child.display_name ?? "Child"}
                      </Link>
                    ) : (
                      <span className="font-medium">Child</span>
                    )}
                    <span className="text-slate-soft mx-2">·</span>
                    <span className="text-slate">
                      {formatUsd(s.amount_usd)}
                      {s.payment_mode === "monthly" ? "/month" : " one-time"}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-soft tracking-[0.1em] mt-1 uppercase">
                    Started {formatDate(s.started_at)}
                    {s.payment_mode === "monthly" && s.next_billing_date
                      ? ` · Next billing ${formatDate(s.next_billing_date)}`
                      : null}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border ${STATUS_PILL[status]}`}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                  <Link
                    href={`/dashboard/sponsorship/${s.id}`}
                    className="text-[12px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline"
                  >
                    View details →
                  </Link>
                </div>
              </li>
            );
          });
        })}
      </ul>
    </section>
  );
}

export default SponsorshipsSection;
