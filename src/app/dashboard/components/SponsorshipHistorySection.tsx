// Stub for Session 11. The sponsorship table doesn't exist yet — this
// component just renders an empty array gracefully so the dashboard can
// import it today without breaking. EmptyDonorState handles the
// "no sponsorships" UI path.
//
// When sponsorship data lands, this component will:
//   - heading: "Your sponsored children"
//   - map sponsorships → cards with child + monthly amount + start date
//
// For now: returns null on empty array, otherwise renders nothing
// useful. The dashboard page picks EmptyDonorState OR this component
// based on length.

export type SponsorshipRow = {
  id: string;
  // Future fields — child relation, monthly_amount, status, start_date, etc.
};

export function SponsorshipHistorySection({
  sponsorships,
}: {
  sponsorships: SponsorshipRow[];
}) {
  if (sponsorships.length === 0) return null;

  return (
    <section>
      <div className="max-w-[640px]">
        <div className="eyebrow-tag">Your sponsorships</div>
        <h2 className="font-display font-normal mt-3 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(1.75rem,3.25vw,2.5rem)]">
          Your sponsored children.
        </h2>
      </div>
      {/* Future: render sponsorship cards here. Stubbed in Session 9. */}
    </section>
  );
}

export default SponsorshipHistorySection;
