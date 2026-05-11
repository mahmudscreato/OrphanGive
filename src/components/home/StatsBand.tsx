import type { HomepageStats } from "@/lib/homepage-data";

function formatCount(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

type StatTileProps = {
  label: string;
  value: string;
  context: string;
  feature?: boolean;
  live?: boolean;
};

function StatTile({ label, value, context, feature, live }: StatTileProps) {
  const baseTile =
    "rounded-[20px] p-9 px-7 relative transition-all duration-[350ms] ease-soft border hover:-translate-y-1 hover:shadow-lift";
  const variant = feature
    ? "border-transparent bg-gradient-to-br from-tangerine-mist to-tangerine-soft"
    : "bg-white border-ink/[0.04] hover:border-tangerine-soft";
  const labelColor = feature ? "text-tangerine-deep" : "text-slate";
  const numberColor = feature ? "text-tangerine-deep" : "text-ink";
  return (
    <div className={`${baseTile} ${variant}`}>
      <div
        className={`font-mono text-[11px] tracking-[0.14em] uppercase mb-6 flex items-center gap-2 ${labelColor}`}
      >
        {live ? (
          <span className="w-1.5 h-1.5 rounded-full bg-moss animate-pulse-dot" />
        ) : null}
        {label}
      </div>
      <div
        className={`font-display italic font-normal leading-none tracking-[-0.03em] text-[clamp(2.5rem,4.5vw,3.75rem)] ${numberColor}`}
      >
        {value}
      </div>
      <div className="mt-4 text-sm text-slate leading-[1.5]">{context}</div>
    </div>
  );
}

export function StatsBand({ stats }: { stats: HomepageStats }) {
  return (
    <section className="px-6 pt-24 pb-20 bg-cream">
      <div className="max-w-[1320px] mx-auto">
        <div className="text-center mb-14">
          <div className="eyebrow-tag justify-center">Live data</div>
          <h2 className="font-display font-normal mt-5 text-ink leading-[1.1] tracking-[-0.02em] text-[clamp(2rem,4vw,3.25rem)] max-w-[720px] mx-auto">
            The scale of the need, and what we&apos;re{" "}
            <em className="italic text-tangerine">doing</em> about it.
          </h2>
        </div>
        <div className="grid grid-cols-4 gap-6 max-lg:grid-cols-2 max-md:grid-cols-1">
          <StatTile
            feature
            label="Bangladesh, total"
            value={stats.bangladesh_total}
            context="orphan children nationwide. The need is generational and immense."
          />
          <StatTile
            live
            label="Listed with us"
            value={formatCount(stats.listed)}
            context="verified profiles, available for sponsorship right now."
          />
          <StatTile
            live
            label="Currently sponsored"
            value={formatCount(stats.sponsored)}
            context="children in active monthly sponsorships across many countries."
          />
          <StatTile
            label="Joining next month"
            value={formatCount(stats.joining_next)}
            context="new profiles in onboarding. Documentation review under way."
          />
        </div>
      </div>
    </section>
  );
}

export default StatsBand;
