// Session 45 — small shared status pill for moment/report/delivery
// cards. Server component (no interactivity). Pending = tangerine,
// approved/published/verified = moss, rejected = slate, draft = stone.

import {
  CheckCircle2,
  Clock,
  Eye,
  FileEdit,
  RotateCcw,
  XCircle,
} from "lucide-react";

export type StatusPillKind =
  | "pending"
  | "published"
  | "verified"
  | "rejected"
  | "draft"
  // Spine 1.2 — new report lifecycle states. ReportCard renders the
  // status pill for any state that isn't 'published' (the terminal
  // donor-visible state). The pill exists as type-safety + DI-facing
  // labels; admin's own view uses its own pill set.
  | "submitted_by_di"
  | "under_admin_review"
  | "approved"
  | "correction_requested";

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
  // Spine 1.2 — DI's submission landed; admin hasn't claimed yet.
  submitted_by_di: {
    bg: "bg-tangerine",
    text: "text-white",
    label: "Submitted — awaiting admin",
    Icon: Clock,
  },
  // Spine 1.2 — admin claimed the row.
  under_admin_review: {
    bg: "bg-tangerine-deep",
    text: "text-white",
    label: "Under admin review",
    Icon: Eye,
  },
  // Spine 1.2 — admin approved; ready to send (Spine 1.3).
  approved: {
    bg: "bg-moss-soft",
    text: "text-moss-deep",
    label: "Approved — ready to send",
    Icon: CheckCircle2,
  },
  // Spine 1.2 — admin sent the report back to the DI. Visually
  // distinct from rejected (which is terminal) — admin wants a fix.
  correction_requested: {
    bg: "bg-amber-100",
    text: "text-amber-800",
    label: "Correction requested",
    Icon: RotateCcw,
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
