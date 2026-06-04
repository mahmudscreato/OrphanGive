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

  function submit() {
    setError(null);
    const body: Record<string, unknown> = {
      sponsorshipId,
      childId,
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
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-lift">
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
                    onChange={(e) => setManualAssigneeId(e.target.value)}
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
