// Session 45 — small shared status pill for moment/report/delivery
// cards. Server component (no interactivity). Pending = tangerine,
// approved/published/verified = moss, rejected = slate, draft = stone.

import { CheckCircle2, Clock, FileEdit, XCircle } from "lucide-react";

export type StatusPillKind =
  | "pending"
  | "published"
  | "verified"
  | "rejected"
  | "draft";

const STYLES: Record<
  StatusPillKind,
  { bg: string; text: string; label: string; Icon: typeof Clock }
> = {
  draft: {
    bg: "bg-stone-200",
    text: "text-stone-700",
    label: "Draft",
    Icon: FileEdit,
  },
  pending: {
    bg: "bg-tangerine",
    text: "text-white",
    label: "Awaiting approval",
    Icon: Clock,
  },
  published: {
    bg: "bg-moss",
    text: "text-white",
    label: "Published",
    Icon: CheckCircle2,
  },
  verified: {
    bg: "bg-moss",
    text: "text-white",
    label: "Verified",
    Icon: CheckCircle2,
  },
  rejected: {
    bg: "bg-slate",
    text: "text-white",
    label: "Rejected",
    Icon: XCircle,
  },
};

export function StatusPill({
  kind,
  labelOverride,
}: {
  kind: StatusPillKind;
  labelOverride?: string;
}) {
  const s = STYLES[kind];
  const Icon = s.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium ${s.bg} ${s.text}`}
    >
      <Icon className="w-3 h-3 stroke-[2]" aria-hidden="true" />
      {labelOverride ?? s.label}
    </span>
  );
}
