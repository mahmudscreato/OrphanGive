import Link from "next/link";
import type { Donor } from "@/lib/donor-data";

function formatDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fullName(donor: Pick<Donor, "first_name" | "last_name">): string {
  return (
    [donor.first_name, donor.last_name].filter(Boolean).join(" ").trim() ||
    "—"
  );
}

function memberSince(donor: Donor): string {
  // Prefer og_agreed_to_terms_at (set on signup); fall back to last_access.
  const candidate = donor.og_agreed_to_terms_at ?? donor.last_access;
  return formatDate(candidate);
}

// Minimal account block — sits at the very bottom of the dashboard so
// it doesn't compete with the sponsorship cards or moments timeline.
// No section heading; just three small fields and a link to manage.
export function AccountSummary({ donor }: { donor: Donor }) {
  return (
    <section
      aria-label="Account"
      className="rounded-[20px] bg-cream/40 border border-ink/[0.05] px-6 py-5 flex items-start justify-between gap-4 flex-wrap max-md:px-5 max-md:py-4"
    >
      <div className="grid grid-cols-3 gap-x-10 gap-y-2 max-md:grid-cols-1">
        <Field label="Name" value={fullName(donor)} />
        <Field label="Email" value={donor.email} />
        <Field label="Member since" value={memberSince(donor)} />
      </div>
      <Link
        href="/dashboard/profile"
        className="text-[12.5px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline whitespace-nowrap"
      >
        Manage account →
      </Link>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-slate-soft mb-0.5">
        {label}
      </div>
      <div className="text-[13.5px] text-ink truncate">{value}</div>
    </div>
  );
}

export default AccountSummary;
