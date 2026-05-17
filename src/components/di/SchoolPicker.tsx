// Session 48a — M2O school picker with inline-create modal.
//
// Renders a select with the DI's school list (pulled from
// /api/di/schools on mount), plus an "+ Add a new school" link that
// opens a small modal. On modal submit, POSTs to
// /api/di/schools/create and auto-selects the new id.
//
// Empty state: when no schools exist yet, the select shows "No
// schools yet — add one below" and the inline-create link is
// immediately visible.

"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";

interface SchoolOption {
  id: string;
  name: string;
  type: string | null;
}

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  school: "School",
  madrasa: "Madrasa",
  vocational: "Vocational",
  other: "Other",
};

export interface SchoolPickerProps {
  /** Currently selected school UUID, or empty string if none. */
  value: string;
  onChange: (id: string) => void;
  /** Optional initial label for the currently-selected school (when
   * editing an existing child whose school is already linked). The
   * list-fetch fills in any missing labels on mount. */
  initialSelectedLabel?: string | null;
  disabled?: boolean;
  /** Optional pre-fill for the inline create modal — passes the
   * current form's division/district so the school inherits them. */
  defaultDivision?: string;
  defaultDistrict?: string;
}

export function SchoolPicker({
  value,
  onChange,
  initialSelectedLabel,
  disabled = false,
  defaultDivision,
  defaultDistrict,
}: SchoolPickerProps) {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Fetch schools on mount.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/di/schools?limit=50", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { schools: [] }))
      .then((body: { schools?: SchoolOption[] }) => {
        if (!alive) return;
        setSchools(Array.isArray(body.schools) ? body.schools : []);
      })
      .catch(() => {
        if (!alive) return;
        setSchools([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // If the form has a pre-selected value (edit mode) whose row isn't
  // in the first page of results, synthesize a placeholder option so
  // the <select> renders the right label until the full list catches
  // up.
  const optionsForSelect: SchoolOption[] = (() => {
    if (value && !schools.find((s) => s.id === value) && initialSelectedLabel) {
      return [{ id: value, name: initialSelectedLabel, type: null }, ...schools];
    }
    return schools;
  })();

  function onCreated(school: SchoolOption) {
    setSchools((arr) => {
      const next = [...arr];
      const existing = next.find((s) => s.id === school.id);
      if (!existing) next.unshift(school);
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    onChange(school.id);
    setShowModal(false);
  }

  return (
    <div>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
      >
        <option value="">
          {loading
            ? "Loading schools…"
            : schools.length === 0
              ? "No schools yet — add one below"
              : "Pick a school…"}
        </option>
        {optionsForSelect.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.type ? ` (${SCHOOL_TYPE_LABELS[s.type] ?? s.type})` : ""}
          </option>
        ))}
      </select>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-tangerine-deeper hover:underline disabled:opacity-60"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
          Add a new school
        </button>
      </div>

      {showModal ? (
        <SchoolCreateModal
          onClose={() => setShowModal(false)}
          onCreated={onCreated}
          defaultDivision={defaultDivision}
          defaultDistrict={defaultDistrict}
        />
      ) : null}
    </div>
  );
}

// ─── Inline-create modal ───────────────────────────────────────────

function SchoolCreateModal({
  onClose,
  onCreated,
  defaultDivision,
  defaultDistrict,
}: {
  onClose: () => void;
  onCreated: (school: SchoolOption) => void;
  defaultDivision?: string;
  defaultDistrict?: string;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("school");
  const [bdDivision, setBdDivision] = useState(defaultDivision ?? "");
  const [bdDistrict, setBdDistrict] = useState(defaultDistrict ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Name is required (at least 2 characters).");
      return;
    }
    startTransition(async () => {
      try {
        const body = {
          name: name.trim(),
          type,
          ...(bdDivision ? { bd_division: bdDivision } : {}),
          ...(bdDistrict ? { bd_district: bdDistrict } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        };
        const res = await fetch("/api/di/schools/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
            existingId?: string | null;
          };
          if (errBody.error === "duplicate_school") {
            setError(
              errBody.existingId
                ? "A school with this name already exists — picking the existing row."
                : "A school with this name already exists.",
            );
            if (errBody.existingId) {
              // Auto-select the existing row so DI doesn't get stuck.
              onCreated({ id: errBody.existingId, name: name.trim(), type });
            }
            return;
          }
          setError("Couldn't save. Try again in a moment.");
          return;
        }
        const okBody = (await res.json()) as {
          school?: { id: string; name: string; type: string | null };
        };
        if (okBody.school) {
          onCreated(okBody.school);
        }
      } catch {
        setError("Network issue. Try again.");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a new school"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">Add a new school</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-soft hover:bg-stone-100"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelClass} htmlFor="sp-name">
              Name
            </label>
            <input
              id="sp-name"
              type="text"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Madaripur Government High School"
              disabled={pending}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="sp-type">
              Type
            </label>
            <select
              id="sp-type"
              className={inputClass}
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={pending}
            >
              <option value="school">School</option>
              <option value="madrasa">Madrasa</option>
              <option value="vocational">Vocational</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="sp-division">
              Division (optional)
            </label>
            <input
              id="sp-division"
              type="text"
              className={inputClass}
              value={bdDivision}
              onChange={(e) => setBdDivision(e.target.value)}
              placeholder="e.g. dhaka"
              disabled={pending}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="sp-district">
              District (optional)
            </label>
            <input
              id="sp-district"
              type="text"
              className={inputClass}
              value={bdDistrict}
              onChange={(e) => setBdDistrict(e.target.value)}
              placeholder="e.g. madaripur"
              disabled={pending}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="sp-notes">
              Notes (optional)
            </label>
            <textarea
              id="sp-notes"
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything admin should know about this institution"
              disabled={pending}
              rows={2}
            />
          </div>
          {error ? (
            <p className="text-[13px] text-[#9A2424] leading-relaxed">{error}</p>
          ) : null}
        </div>
        <div className="px-5 py-4 border-t border-stone-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[14px] text-slate hover:text-tangerine-deeper transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-tangerine text-white text-[14px] font-medium hover:bg-tangerine-deep disabled:opacity-60 transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Add school
          </button>
        </div>
      </div>
    </div>
  );
}
