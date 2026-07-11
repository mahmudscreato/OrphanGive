import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCurrentDonor,
  getDonorState,
} from "@/lib/donor-data";
import {
  type ChildMoment,
  type ChildReport,
  getRecentMomentsForDonor,
  getRecentReportsForDonor,
} from "@/lib/dashboard-data";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { MomentRow } from "../components/MomentRow";
import { ReportRow } from "../components/ReportRow";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Updates — OrphanGive",
};

const PER_CHILD_CAP = 6;

// fix/donor-updates-feed (U1) — one aggregated feed of BOTH published
// reports and moments. Each item carries a `kind` discriminator + a
// normalized `date` so the two collections interleave chronologically.
type FeedItem =
  | { kind: "moment"; date: number; data: ChildMoment }
  | { kind: "report"; date: number; data: ChildReport };

function toTime(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export default async function DashboardUpdatesPage() {
  const donor = await getCurrentDonor();
  if (!donor) redirect("/signin?next=/dashboard/updates");
  const state = getDonorState(donor);
  if (state !== "approved") redirect("/dashboard");

  // Both readers scope to the SAME visible-children set
  // (getVisibleChildScope): the donor's own children with an active,
  // completed, or paused sponsorship. Neither can surface another
  // donor's child or a cancelled-only child.
  const [moments, reports] = await Promise.all([
    getRecentMomentsForDonor(donor.id, 100),
    getRecentReportsForDonor(donor.id, 100),
  ]);

  const items: FeedItem[] = [
    ...moments.map(
      (m): FeedItem => ({
        kind: "moment",
        date: toTime(m.taken_at ?? m.date_created),
        data: m,
      }),
    ),
    ...reports.map(
      (r): FeedItem => ({
        kind: "report",
        date: toTime(r.published_at),
        data: r,
      }),
    ),
  ];

  const groups = groupByChild(items);

  return (
    <div className="space-y-10">
      <header>
        <div className="inline-flex items-center text-script-md text-tangerine-deep">
          <EyebrowIcon />
          Updates
        </div>
        <h1 className="mt-3 font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
          Recent updates
        </h1>
        <p className="mt-2 text-[15px] text-slate italic">
          Reports and moments from the children you support.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="text-[14.5px] text-slate-soft leading-[1.6] max-w-[560px]">
          Updates will appear here as our team shares reports and moments
          from the children you support.
        </p>
      ) : (
        <div className="space-y-12">
          {groups.map((g) => (
            <ChildBlock key={g.childId} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

type Group = {
  childId: string;
  childName: string | null;
  childPhoto: string | null;
  items: FeedItem[];
};

function childFieldsOf(item: FeedItem): {
  id: string;
  name: string | null;
  photo: string | null;
} {
  return {
    id: item.data.child_id,
    name: item.data.child_name,
    photo: item.data.child_photo,
  };
}

function groupByChild(items: FeedItem[]): Group[] {
  const map = new Map<string, Group>();
  for (const item of items) {
    const { id, name, photo } = childFieldsOf(item);
    if (!id) continue;
    const existing = map.get(id);
    if (existing) {
      existing.items.push(item);
      // Prefer a non-null name/photo if this item carries one.
      if (!existing.childName && name) existing.childName = name;
      if (!existing.childPhoto && photo) existing.childPhoto = photo;
    } else {
      map.set(id, { childId: id, childName: name, childPhoto: photo, items: [item] });
    }
  }
  const groups = Array.from(map.values()).map((g) => ({
    ...g,
    // Newest-first within each child, capped.
    items: [...g.items].sort((a, b) => b.date - a.date).slice(0, PER_CHILD_CAP),
  }));
  // Order children by their single most-recent item (report or moment).
  groups.sort((a, b) => (b.items[0]?.date ?? 0) - (a.items[0]?.date ?? 0));
  return groups;
}

function ChildBlock({ group }: { group: Group }) {
  const photoSrc = directusAssetUrl(group.childPhoto);
  const name = group.childName?.trim() || "A child";
  return (
    <section>
      <header className="flex items-center gap-3 mb-4">
        <Link
          href={`/children/${group.childId}`}
          className="flex items-center gap-3 group"
        >
          <div className="relative w-12 h-12 rounded-full overflow-hidden bg-tangerine-mist shrink-0">
            {photoSrc ? (
              <ProtectedChildImage
                src={photoSrc}
                alt={name}
                width={96}
                height={96}
                quality={85}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-tangerine font-display text-[20px]">
                {name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <h2 className="font-display text-[22px] text-ink leading-tight tracking-[-0.01em] m-0 group-hover:text-tangerine-deeper transition-colors">
              {name}
            </h2>
            <p className="text-[12px] text-slate-soft mt-0.5">
              {group.items.length}{" "}
              {group.items.length === 1 ? "update" : "updates"}
            </p>
          </div>
        </Link>
      </header>
      <ul className="space-y-3">
        {group.items.map((item) =>
          item.kind === "moment" ? (
            <MomentRow key={`m-${item.data.id}`} moment={item.data} />
          ) : (
            <ReportRow key={`r-${item.data.id}`} report={item.data} />
          ),
        )}
      </ul>
    </section>
  );
}
