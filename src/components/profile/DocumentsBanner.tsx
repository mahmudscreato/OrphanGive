import type { ChildDocSummary } from "@/lib/child-profile-data";

const DOT_CLASSES: Record<ChildDocSummary["status"], string> = {
  verified: "bg-moss text-moss",
  pending: "bg-tangerine text-tangerine",
  missing: "bg-slate-soft text-slate-soft",
};

const STATUS_LABEL: Record<ChildDocSummary["status"], string> = {
  verified: "Verified",
  pending: "Pending review",
  missing: "Not on file",
};

function VerifiedTick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
      <path
        d="M5 12l4 4L19 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function StatusIcon({ status }: { status: ChildDocSummary["status"] }) {
  if (status === "verified") return <VerifiedTick />;
  if (status === "pending") return <ClockIcon />;
  return <MinusIcon />;
}

export function DocumentsBanner({ docs }: { docs: ChildDocSummary[] }) {
  const verifiedCount = docs.filter((d) => d.status === "verified").length;
  const total = docs.length;

  return (
    <section className="px-6 pb-28 bg-cream max-md:pb-20">
      <div className="max-w-[1100px] mx-auto rounded-[28px] bg-linen border border-ink/[0.05] px-8 py-7 max-md:px-6 max-md:py-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-moss-soft text-moss flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
              <path
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-[19px] font-medium text-ink">
              {verifiedCount} of {total} documents verified
            </h3>
            <p className="text-[12.5px] text-slate mt-0.5">
              Reviewed by our field team and never shared publicly.
            </p>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
          {docs.map((d) => {
            const dotBg = DOT_CLASSES[d.status].split(" ")[0];
            return (
              <li
                key={d.type}
                className="flex items-center gap-3 bg-white/70 rounded-xl px-3.5 py-2.5"
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-cream ${dotBg}`}
                  title={STATUS_LABEL[d.status]}
                >
                  <StatusIcon status={d.status} />
                </span>
                <div className="flex-1">
                  <div className="text-[13.5px] text-ink font-medium">
                    {d.label}
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate-soft mt-0.5">
                    {STATUS_LABEL[d.status]}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default DocumentsBanner;
