import Link from "next/link";
import { COUNTRY_BY_CODE } from "@/lib/countries";
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
  return [donor.first_name, donor.last_name].filter(Boolean).join(" ").trim() || "—";
}

function memberSince(donor: Donor): string {
  // Prefer og_agreed_to_terms_at (set on signup); fall back to last_access.
  const candidate = donor.og_agreed_to_terms_at ?? donor.last_access;
  return formatDate(candidate);
}

function countryLabel(code: string | null): string {
  if (!code) return "—";
  const c = COUNTRY_BY_CODE[code];
  return c ? c.name : code;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="grid grid-cols-[180px_1fr] gap-6 py-3.5 border-b border-ink/[0.06] last:border-b-0 max-md:grid-cols-1 max-md:gap-1 max-md:py-3">
    <div className="font-mono text-[11px] text-slate-soft tracking-[0.14em] uppercase">
      {label}
    </div>
    <div className="text-[15px] text-ink break-words">{value}</div>
  </div>
);

export function AccountSummary({ donor }: { donor: Donor }) {
  return (
    <section className="rounded-[28px] bg-cream border border-ink/[0.06] px-7 py-6 max-md:px-5 max-md:py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-[22px] text-ink font-medium">
          Your account
        </h2>
        <Link
          href="/dashboard/profile"
          className="text-[13px] text-tangerine-deep border-b border-tangerine pb-0.5 transition-[gap] duration-[250ms]"
        >
          Edit profile
        </Link>
      </div>
      <div>
        <Row label="Full name" value={fullName(donor)} />
        <Row label="Email" value={donor.email} />
        <Row label="Country" value={countryLabel(donor.og_country)} />
        <Row label="Phone" value={donor.og_phone || "—"} />
        <Row label="Member since" value={memberSince(donor)} />
      </div>
    </section>
  );
}

export default AccountSummary;
