"use client";

// Spine 1.1 — Create-field-task modal.
//
// Used on /admin/sponsorships/[id] (sponsorship pre-filled) and
// /admin/tasks/new (sponsorship picked from a server-side selector
// before this modal mounts).
//
// Privacy: this component receives Tier-1 child data only —
// display_name + division name/code. NO district, DOB, guardian
// fields, etc.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskType } from "@/lib/di-tasks";
// Type-only import — erased at compile time, so the server-only
// admin-tasks module is never pulled into this client bundle.
import type { PickableChild } from "@/lib/admin-tasks";
import {
  TASK_TEMPLATES,
  type TaskTemplate,
} from "@/lib/task-templates";

interface DI {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  coversChildDivision: boolean;
}

export interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  // Piece #2 — null = a general task not tied to any sponsorship.
  sponsorshipId: string | null;
  childId: string | null;
  // For display only — keeps the modal's "you're creating a task
  // for X" header informative without re-fetching.
  childDisplayName: string | null;
  childDivisionCode: string | null;
  childDivisionName: string | null;
  // Sorted by listAssignableDIs (in-scope first, alpha within).
  availableDIs: DI[];
  // SS1 — Tier-1 children for the optional child picker. Only used when
  // creating a GENERAL task (no sponsorship): the picker surfaces the
  // chosen assignee DI's assigned children first, but all are
  // searchable. Omitted on the sponsorship-bound create path (the child
  // is the sponsorship's child there).
  pickableChildren?: PickableChild[];
}

type Priority = "low" | "normal" | "high" | "urgent";

export function CreateTaskModal({
  open,
  onClose,
  sponsorshipId,
  childId,
  childDisplayName,
  childDivisionCode,
  childDivisionName,
  availableDIs,
  pickableChildren,
}: CreateTaskModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Piece #2 — task type, driven by the template picker. Defaults to
  // 'general' so the form is valid from the start (blank + general).
  const [type, setType] = useState<TaskType>("general");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  // SS1 — optional child for a general task. Starts from the bound
  // childId (null on the general path).
  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    childId,
  );
  const [childSearch, setChildSearch] = useState("");
  const [assigneeMode, setAssigneeMode] = useState<"manual" | "auto">(
    childDivisionCode &&
      availableDIs.some((d) => d.coversChildDivision)
      ? "auto"
      : "manual",
  );
  const [manualAssigneeId, setManualAssigneeId] = useState<string>(
    () =>
      availableDIs.find((d) => d.coversChildDivision)?.id ??
      availableDIs[0]?.id ??
      "",
  );
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  // Apply a quick-create template. Named templates (those carrying a
  // pre-fill title) overwrite title/description/priority — picking one
  // is an explicit "start from this". Blank templates (General/Custom)
  // set ONLY the type so they don't wipe anything the admin already
  // typed.
  function applyTemplate(t: TaskTemplate) {
    setType(t.type);
    if (t.title) {
      setTitle(t.title);
      setDescription(t.description);
      setPriority(t.priority);
    }
  }

  const autoAssignAvailable =
    childDivisionCode !== null &&
    availableDIs.some((d) => d.coversChildDivision);

  // SS1 — show the optional child picker only on the general-task path
  // (no sponsorship). On the sponsorship-bound path the child is fixed.
  const showChildPicker =
    sponsorshipId === null && (pickableChildren?.length ?? 0) > 0;

  function childLabelFor(c: PickableChild): string {
    return c.firstName || c.displayName || "Unnamed child";
  }

  // DI-scoped: list ONLY the selected DI's assigned children
  // (child.assigned_di === manualAssigneeId), searchable within that
  // caseload. When no DI is selected yet, show nothing (the picker
  // prompts to pick a DI first). Plain const (NOT useMemo) so it sits
  // after the `if (!open)` early return without breaking the rules of
  // hooks. The list is small (Tier-1, ≤500).
  const childQuery = childSearch.trim().toLowerCase();
  const visibleChildren =
    showChildPicker && manualAssigneeId
      ? [...(pickableChildren ?? [])]
          .filter((c) => c.assignedDiId === manualAssigneeId)
          .filter((c) =>
            childQuery
              ? [c.firstName, c.displayName, c.divisionName]
                  .filter(Boolean)
                  .some((s) => s!.toLowerCase().includes(childQuery))
              : true,
          )
          .sort((a, b) =>
            childLabelFor(a).toLowerCase() < childLabelFor(b).toLowerCase()
              ? -1
              : 1,
          )
          .slice(0, 60)
      : [];

  function submit() {
    setError(null);
    const body: Record<string, unknown> = {
      sponsorshipId,
      childId: showChildPicker ? selectedChildId : childId,
      title: title.trim(),
      type,
      description: description.trim() || null,
      dueDate: dueDate.trim() || null,
      priority,
      autoAssign: assigneeMode === "auto",
      assigneeUserId: assigneeMode === "manual" ? manualAssigneeId : null,
    };
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
            issues?: Array<{ path: string; message: string }>;
          };
          if (data.error === "no_di_for_division") {
            setError(
              data.message ??
                "No Data Inputter covers this division — pick one manually.",
            );
            setAssigneeMode("manual");
            return;
          }
          if (data.issues && data.issues.length > 0) {
            setError(
              data.issues
                .map((i) => `${i.path}: ${i.message}`)
                .join("; "),
            );
            return;
          }
          setError(data.message ?? data.error ?? "Failed to create task.");
          return;
        }
        // Success — refresh the page so the new task appears in
        // any relevant list, and close the modal.
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  function diLabel(d: DI): string {
    const name = [d.firstName?.trim(), d.lastName?.trim()]
      .filter(Boolean)
      .join(" ");
    const base = name.length > 0 ? name : d.email;
    return d.coversChildDivision ? `${base} ✓ in-scope` : base;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-title"
    >
      {/* BUG-2 FIX: was max-w-lg (512px) — too narrow for the template
          grid + child picker. Widen to max-w-3xl (768px) to match the
          admin detail-page content width. Pure layout; fields/logic
          unchanged. max-h + overflow keeps the taller form usable on
          short viewports now that it's wider. */}
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-lift">
        <header className="px-6 pt-6 pb-3 border-b border-stone-200">
          <h2
            id="create-task-title"
            className="font-display text-[22px] text-ink leading-tight"
          >
            Create field task
          </h2>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            {childDisplayName ? (
              <>
                For <span className="font-medium">{childDisplayName}</span>
                {childDivisionName ? (
                  <>
                    {" "}
                    · {childDivisionName}
                  </>
                ) : null}
              </>
            ) : sponsorshipId === null ? (
              <>General task — not tied to a child or sponsorship.</>
            ) : (
              <>Campaign sponsorship — no child anchor.</>
            )}
          </p>
        </header>

        <div className="px-6 py-5 space-y-4">
          {/* Template picker — sets the task type + (for named
              templates) pre-fills title/description/priority. */}
          <div>
            <span className="block text-[12.5px] font-medium text-ink mb-1.5">
              Template
            </span>
            <div className="grid grid-cols-2 gap-2">
              {TASK_TEMPLATES.map((t) => {
                const active = type === t.type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    aria-pressed={active}
                    className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                      active
                        ? "border-tangerine bg-tangerine-mist"
                        : "border-stone-300 bg-white hover:border-tangerine-soft hover:bg-tangerine-mist/40"
                    }`}
                  >
                    <span className="block text-[13px] font-medium text-ink">
                      {t.label}
                    </span>
                    <span className="block text-[11.5px] text-ink-soft leading-snug">
                      {t.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <label className="block">
            <span className="block text-[12.5px] font-medium text-ink mb-1.5">
              Title <span className="text-tangerine-deeper">*</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Deliver school supplies"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine"
              required
            />
          </label>

          {/* Description */}
          <label className="block">
            <span className="block text-[12.5px] font-medium text-ink mb-1.5">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Optional context for the DI."
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine"
            />
          </label>

          {/* Due date + priority */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[12.5px] font-medium text-ink mb-1.5">
                Due date
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine"
              />
            </label>
            <label className="block">
              <span className="block text-[12.5px] font-medium text-ink mb-1.5">
                Priority
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>

          {/* Assignee */}
          <fieldset className="block">
            <legend className="block text-[12.5px] font-medium text-ink mb-2">
              Assign to
            </legend>
            <div className="space-y-2">
              {autoAssignAvailable ? (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="assignee-mode"
                    value="auto"
                    checked={assigneeMode === "auto"}
                    onChange={() => setAssigneeMode("auto")}
                    className="mt-0.5"
                  />
                  <span className="text-[13.5px] text-ink leading-snug">
                    Auto-assign
                    <span className="block text-[12px] text-ink-soft">
                      Pick the first DI covering{" "}
                      <span className="font-medium">
                        {childDivisionName ?? childDivisionCode}
                      </span>
                      .
                    </span>
                  </span>
                </label>
              ) : null}

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="assignee-mode"
                  value="manual"
                  checked={assigneeMode === "manual"}
                  onChange={() => setAssigneeMode("manual")}
                  className="mt-0.5"
                />
                <span className="text-[13.5px] text-ink leading-snug w-full">
                  Pick a Data Inputter
                  <select
                    value={manualAssigneeId}
                    onChange={(e) => {
                      setManualAssigneeId(e.target.value);
                      // Picker is DI-scoped now: clear any child picked
                      // for the previous DI so we never submit a child
                      // outside the chosen DI's caseload.
                      setSelectedChildId(null);
                    }}
                    disabled={assigneeMode !== "manual"}
                    className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine disabled:opacity-50"
                  >
                    {availableDIs.length === 0 ? (
                      <option value="">— no active DIs —</option>
                    ) : (
                      availableDIs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {diLabel(d)}
                        </option>
                      ))
                    )}
                  </select>
                </span>
              </label>
            </div>
            {!autoAssignAvailable && childId !== null ? (
              <p className="mt-2 text-[12px] text-tangerine-deeper leading-snug">
                No Data Inputter covers{" "}
                {childDivisionName ?? "this child's division"}. Pick one
                manually.
              </p>
            ) : null}
            {childId === null ? (
              <p className="mt-2 text-[12px] text-ink-soft leading-snug">
                {sponsorshipId === null
                  ? "General task — no child or division scope. Pick a DI manually."
                  : "Campaign sponsorship — no child, no division scope. Pick a DI manually."}
              </p>
            ) : null}
          </fieldset>

          {/* SS1 — optional child picker (general-task path only).
              The chosen assignee DI's assigned children sort first; all
              children are searchable. Child stays optional. */}
          {showChildPicker ? (
            <div>
              <span className="block text-[12.5px] font-medium text-ink mb-1">
                Child <span className="text-ink-soft font-normal">(optional)</span>
              </span>
              <p className="text-[12px] text-ink-soft mb-2 leading-snug">
                Only the selected DI&apos;s assigned children can be picked
                here. Leave on &ldquo;No child&rdquo; for a general task.
              </p>
              {/* Search only once a DI is chosen — the list is DI-scoped. */}
              {manualAssigneeId ? (
                <input
                  type="text"
                  value={childSearch}
                  onChange={(e) => setChildSearch(e.target.value)}
                  placeholder="Search this DI's children…"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine mb-2"
                />
              ) : null}
              <div className="max-h-44 overflow-y-auto rounded-lg border border-stone-200 divide-y divide-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedChildId(null)}
                  className={`w-full text-left px-3 py-2 text-[13.5px] ${
                    selectedChildId === null
                      ? "bg-tangerine-mist text-tangerine-deeper font-medium"
                      : "text-ink hover:bg-stone-50"
                  }`}
                >
                  No child — general task
                </button>
                {!manualAssigneeId ? (
                  <p className="px-3 py-2 text-[12.5px] text-ink-soft">
                    Pick a Data Inputter above to see their assigned children.
                  </p>
                ) : (
                  <>
                    {visibleChildren.map((c) => {
                      const active = selectedChildId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedChildId(c.id)}
                          className={`w-full text-left px-3 py-2 text-[13.5px] ${
                            active
                              ? "bg-tangerine-mist text-tangerine-deeper font-medium"
                              : "text-ink hover:bg-stone-50"
                          }`}
                        >
                          <span className="truncate">
                            {childLabelFor(c)}
                            {c.divisionName ? (
                              <span className="text-ink-soft">
                                {" "}
                                · {c.divisionName}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                    {visibleChildren.length === 0 ? (
                      <p className="px-3 py-2 text-[12.5px] text-ink-soft">
                        {childSearch.trim()
                          ? "No children match your search."
                          : "This Data Inputter has no assigned children."}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-800">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="px-6 py-4 border-t border-stone-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-[13.5px] font-medium text-ink-soft hover:bg-stone-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={
              isPending ||
              title.trim().length === 0 ||
              (assigneeMode === "manual" && !manualAssigneeId)
            }
            className="px-4 py-2 rounded-lg bg-tangerine-deep text-white text-[13.5px] font-medium hover:bg-tangerine-deeper transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Creating…" : "Create task"}
          </button>
        </footer>
      </div>
    </div>
  );
}
