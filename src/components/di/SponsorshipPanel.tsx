// Session 43 — Sponsorship tab content for Child Detail.
//
// Server component. Renders one inner card per active/paused
// sponsorship, with the EXACT amount prominently displayed in
// tangerine-deeper — that's the load-bearing transparency the spec
// (§2.6) calls for. Donor PII has already been stripped at the
// server data layer; we only consume the redacted DiSponsorshipView.

import { Heart } from "lucide-react";
import type { DiSponsorshipView } from "@/lib/di-children";
import { COUNTRY_BY_CODE } from "@/lib/countries";

function countryName(code: string | null): string | null {
  if (!code) return null;
  return COUNTRY_BY_CODE[code.toUpperCase()]?.name ?? code;
}

function formatLongDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function categoryLabel(cat: DiSponsorshipView["sponsor_category"]): string {
  if (cat === "monthly") return "Monthly sponsor";
  if (cat === "prepaid") return "Prepaid sponsor";
  if (cat === "one_time") return "One-time donation";
  return "Sponsor";
}

function statusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function formatAmountLine(s: DiSponsorshipView): string | null {
  if (s.amount === null || !Number.isFinite(s.amount)) return null;
  const symbol = s.currency?.trim().toUpperCase() || "BDT";
  const value = Number.isInteger(s.amount) ? s.amount : s.amount.toFixed(2);
  if (s.sponsor_category === "prepaid") {
    return `${symbol} ${value} prepaid`;
  }
  if (s.sponsor_category === "one_time") {
    return `${symbol} ${value} (one-time)`;
  }
  // Default: monthly recurring.
  return `${symbol} ${value} per month`;
}

function SponsorshipCard({ sponsorship: s }: { sponsorship: DiSponsorshipView }) {
  const country = countryName(s.country);
  const subtitle = [categoryLabel(s.sponsor_category), country]
    .filter(Boolean)
    .join(" · ");
  const amountLine = formatAmountLine(s);
  const startedLine = formatLongDate(s.start_date);
  const endsLine = formatLongDate(s.end_date);

  return (
    <div className="rounded-xl bg-tangerine-mist/40 border border-tangerine-soft/60 p-4">
      <div className="font-display text-[18px] text-ink leading-tight">
        {s.donor_display_name}
      </div>
      <div className="mt-0.5 text-[13.5px] text-slate">{subtitle}</div>

      {amountLine ? (
        <div className="mt-3 font-display text-[20px] text-tangerine-deeper font-medium">
          {amountLine}
        </div>
      ) : (
        <div className="mt-3 text-[13.5px] italic text-slate-soft">
          Amount not yet recorded
        </div>
      )}

      <dl className="mt-3 space-y-1 text-[13.5px] text-slate">
        {startedLine ? (
          <div className="flex gap-2">
            <dt className="font-medium text-ink-soft">Started</dt>
            <dd>{startedLine}</dd>
          </div>
        ) : null}
        {endsLine ? (
          <div className="flex gap-2">
            <dt className="font-medium text-ink-soft">Ends</dt>
            <dd>{endsLine}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="font-medium text-ink-soft">Status</dt>
          <dd>{statusLabel(s.status)}</dd>
        </div>
        {s.queue_position !== null && s.queue_position > 0 ? (
          <div className="flex gap-2">
            <dt className="font-medium text-ink-soft">Queue position</dt>
            <dd>#{s.queue_position}</dd>
          </div>
        ) : null}
        {s.prepaid_months_remaining !== null &&
        s.prepaid_months_remaining > 0 ? (
          <div className="flex gap-2">
            <dt className="font-medium text-ink-soft">Months remaining</dt>
            <dd>{s.prepaid_months_remaining}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function SponsorshipPanel({
  sponsorships,
}: {
  sponsorships: DiSponsorshipView[];
}) {
  return (
    <section
      aria-label="Sponsorship"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-6"
    >
      <h2 className="font-display text-[22px] text-ink mb-4">Sponsorship</h2>

      {sponsorships.length === 0 ? (
        <div className="py-8 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-4"
            aria-hidden="true"
          >
            <Heart className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="text-[15px] text-ink leading-relaxed max-w-sm mx-auto">
            This child is awaiting a sponsor.
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed max-w-sm mx-auto mt-1">
            When a donor begins sponsoring, you&apos;ll see their details here.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {sponsorships.map((s) => (
              <SponsorshipCard key={s.id} sponsorship={s} />
            ))}
          </div>
          <p className="mt-5 font-script italic text-[16px] text-slate text-center">
            These are the donors making this child&apos;s care possible.
          </p>
        </>
      )}
    </section>
  );
}
