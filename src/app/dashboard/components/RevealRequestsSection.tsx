import Link from "next/link";
import {
  REVEAL_FIELD_LABELS,
  type AllowedRevealField,
  type RevealRequest,
} from "@/lib/reveal-data";

type Props = {
  // Each row carries either child as a uuid string OR as an expanded object
  // depending on the fetch shape — we tolerate both.
  requests: Array<
    RevealRequest & {
      child?:
        | string
        | { id?: string; display_name?: string | null }
        | null;
    }
  >;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  revoked: "Revoked",
  expired: "Expired",
};

const STATUS_PILL: Record<string, string> = {
  pending: "bg-tangerine-mist text-tangerine-deep border-tangerine-soft",
  approved: "bg-moss-soft text-moss-deep border-moss/30",
  denied: "bg-[#FEEFEF] text-[#A02B2B] border-[#F4C7C7]",
  revoked: "bg-[#FEEFEF] text-[#A02B2B] border-[#F4C7C7]",
  expired: "bg-ink/[0.04] text-slate-soft border-ink/[0.08]",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-tangerine",
  approved: "bg-moss",
  denied: "bg-[#D04848]",
  revoked: "bg-[#D04848]",
  expired: "bg-slate-soft",
};

const STATUS_ORDER = ["pending", "approved", "denied", "revoked", "expired"];

function fieldLabel(name: string): string {
  return (
    REVEAL_FIELD_LABELS[name as AllowedRevealField] ??
    name.replace(/_encrypted$/, "").replace(/_/g, " ")
  );
}

function childLabel(
  child: Props["requests"][number]["child"],
): { id: string; name: string } {
  if (child == null) return { id: "", name: "Unknown child" };
  if (typeof child === "string") return { id: child, name: "View child" };
  const obj = child as { id?: string; display_name?: string | null };
  return {
    id: obj.id ?? "",
    name: (obj.display_name ?? "Unknown child").trim() || "Unknown child",
  };
}

function formatDate(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function RevealRequestsSection({ requests }: Props) {
  if (requests.length === 0) return null;

  // Group by status, ordered for visibility.
  const groups = new Map<string, typeof requests>();
  for (const r of requests) {
    const key = STATUS_ORDER.includes(r.status) ? r.status : "expired";
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  return (
    <section>
      <ul className="space-y-3">
        {STATUS_ORDER.flatMap((status) => {
          const items = groups.get(status);
          if (!items || items.length === 0) return [];
          return items.map((r) => {
            const child = childLabel(r.child);
            const daysLeft =
              status === "approved" ? daysFromNow(r.approved_until) : null;
            return (
              <li
                key={r.id}
                className="rounded-[18px] bg-white border border-ink/[0.06] px-5 py-4 flex items-center justify-between gap-4 flex-wrap max-md:flex-col max-md:items-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] text-ink">
                    {child.id ? (
                      <Link
                        href={`/children/${child.id}`}
                        className="font-medium hover:text-tangerine-deeper transition-colors underline-offset-4 hover:underline"
                      >
                        {child.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{child.name}</span>
                    )}
                    <span className="text-slate-soft mx-2">·</span>
                    <span className="text-slate">{fieldLabel(r.field_name)}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-soft tracking-[0.1em] mt-1 uppercase">
                    Requested {formatDate(r.date_created)}
                    {r.decided_at
                      ? ` · ${STATUS_LABEL[r.status] ?? r.status} ${formatDate(r.decided_at)}`
                      : null}
                    {daysLeft !== null && daysLeft >= 0
                      ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                      : null}
                  </div>
                  {r.status === "denied" && r.admin_decision_note ? (
                    <p className="mt-2 text-[13px] text-slate leading-snug max-w-[640px]">
                      <span className="text-slate-soft font-mono text-[10px] tracking-[0.12em] uppercase">
                        Note from team:
                      </span>{" "}
                      {r.admin_decision_note}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border ${STATUS_PILL[status] ?? STATUS_PILL.expired}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-slate-soft"}`} />
                  {STATUS_LABEL[status] ?? status}
                </span>
              </li>
            );
          });
        })}
      </ul>
    </section>
  );
}

export default RevealRequestsSection;
