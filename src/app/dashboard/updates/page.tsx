import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCurrentDonor,
  getDonorState,
} from "@/lib/donor-data";
import {
  type ChildMoment,
  getRecentMomentsForDonor,
} from "@/lib/dashboard-data";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { MomentRow } from "../components/MomentRow";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Updates — OrphanGive",
};

const PER_CHILD_CAP = 5;

export default async function DashboardUpdatesPage() {
  const donor = await getCurrentDonor();
  if (!donor) redirect("/signin?next=/dashboard/updates");
  const state = getDonorState(donor);
  if (state !== "approved") redirect("/dashboard");

  const moments = await getRecentMomentsForDonor(donor.id, 100);
  const groups = groupByChild(moments);

  return (
    <div className="space-y-10">
      <header>
        <div className="inline-flex items-center text-script-md text-tangerine-deep">
          <EyebrowIcon />
          Updates
        </div>
        <h1 className="mt-3 font-display text-[32px] text-ink leading-tight tracking-[-0.02em] m-0">
          Recent moments
        </h1>
        <p className="mt-2 text-[15px] text-slate italic">
          From the children you support.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="text-[14.5px] text-slate-soft leading-[1.6] max-w-[560px]">
          Updates will appear here as our team shares moments from the
          children you support.
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
  moments: ChildMoment[];
};

function groupByChild(moments: ChildMoment[]): Group[] {
  const map = new Map<string, Group>();
  for (const m of moments) {
    const existing = map.get(m.child_id);
    if (existing) {
      existing.moments.push(m);
    } else {
      map.set(m.child_id, {
        childId: m.child_id,
        childName: m.child_name,
        childPhoto: m.child_photo,
        moments: [m],
      });
    }
  }
  // Cap each group at the per-child max; preserve newest-first order
  // (groupByChild relies on the input already being sorted newest-first).
  const groups = Array.from(map.values()).map((g) => ({
    ...g,
    moments: g.moments.slice(0, PER_CHILD_CAP),
  }));
  // Order groups by their most-recent moment's date, newest first.
  groups.sort((a, b) => {
    const ta = momentTime(a.moments[0]);
    const tb = momentTime(b.moments[0]);
    return tb - ta;
  });
  return groups;
}

function momentTime(m: ChildMoment | undefined): number {
  if (!m) return 0;
  const iso = m.taken_at ?? m.date_created;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
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
              {group.moments.length}{" "}
              {group.moments.length === 1 ? "update" : "updates"}
            </p>
          </div>
        </Link>
      </header>
      <ul className="space-y-3">
        {group.moments.map((m) => (
          <MomentRow key={m.id} moment={m} />
        ))}
      </ul>
    </section>
  );
}
