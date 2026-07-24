// feat/quick-donation — read-only admin list of GUEST (no-account)
// pooled cause donations, so incoming money is visible in-app without
// opening Directus Studio.
//
// Distinct from /admin/donations (the sponsorship fulfillment queue) —
// these rows have NO donor account, NO sponsorship, and NO child by
// design. Read-only: there are no actions here; refunds are issued in
// Stripe and mirrored back by the webhook's guest branch.

import { Gift } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  listGuestDonations,
  type GuestDonationRow,
} from "@/lib/guest-donations";

export const dynamic = "force-dynamic";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function amountLabel(r: GuestDonationRow): string {
  if (r.donor_currency_amount !== null && r.donor_currency_code) {
    return `${r.donor_currency_amount} ${r.donor_currency_code}`;
  }
  return `${r.amount_bdt} BDT`;
}

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-moss-soft text-moss-deep",
  pending: "bg-amber-50 text-amber-800",
  failed: "bg-[#FCE9E9] text-[#A02020]",
  refunded: "bg-stone-100 text-stone-700",
  disputed: "bg-[#FCE9E9] text-[#A02020]",
};

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-stone-100 text-stone-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${cls}`}
    >
      {status}
    </span>
  );
}

export default async function AdminGuestDonationsPage() {
  const rows = await listGuestDonations();
  const succeededTotalBdt = rows
    .filter((r) => r.status === "succeeded")
    .reduce((sum, r) => sum + (r.amount_bdt ?? 0), 0);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      <AdminPageHeader
        title="Guest donations"
        subtitle="One-time pooled cause gifts made without an account. Read-only — refunds are issued in Stripe and mirror back here automatically."
      />

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <Gift
            className="w-10 h-10 text-stone-400 mx-auto mb-3 stroke-[1.5]"
            aria-hidden="true"
          />
          <p className="text-[14px] text-ink-soft leading-relaxed">
            No guest donations yet.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-[13px] text-ink-soft">
            {rows.length} {rows.length === 1 ? "donation" : "donations"} ·{" "}
            <span className="text-ink font-medium">
              {succeededTotalBdt.toLocaleString()} BDT
            </span>{" "}
            received (succeeded only)
          </p>

          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden">
            <table className="w-full text-[13.5px]">
              <thead className="bg-stone-50 text-left text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Cause</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="px-4 py-3">
                      <span className="text-ink">
                        {r.package_title ?? "—"}
                      </span>
                      {r.child_count ? (
                        <span className="ml-2 text-ink-soft">
                          × {r.child_count}
                        </span>
                      ) : (
                        <span className="ml-2 text-ink-soft italic">
                          custom
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {amountLabel(r)}
                    </td>
                    <td className="px-4 py-3 text-ink-soft break-all">
                      {r.guest_email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={String(r.status)} />
                    </td>
                    <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                      {formatWhen(r.paid_at ?? r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="font-display text-[16px] text-ink leading-snug">
                    {r.package_title ?? "—"}
                  </p>
                  <StatusPill status={String(r.status)} />
                </div>
                <p className="mt-1 text-[13px] text-ink">
                  {amountLabel(r)}
                  {r.child_count ? (
                    <span className="text-ink-soft"> · {r.child_count} children</span>
                  ) : (
                    <span className="text-ink-soft italic"> · custom</span>
                  )}
                </p>
                <p className="mt-1 text-[12.5px] text-ink-soft break-all">
                  {r.guest_email ?? "—"}
                </p>
                <p className="mt-1 text-[12px] text-ink-soft">
                  {formatWhen(r.paid_at ?? r.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
