// Session 48a — M2O school picker with inline-create modal.
// Session 48b — refactored from native <select> to a typeahead.
//
// Why: the school table grows over time. A 50-row select page becomes
// unusable past ~30 entries (no search), and even with the inline-add
// link DIs default to "I can't find it, add a new one" which spawns
// duplicates. The typeahead surfaces only matches as the DI types,
// debounced 300ms, with a scrollable popover list.
//
// Behavior:
//   - Empty input on mount: hitting focus loads the first 20 schools
//     alphabetically (cheap, gives DIs something to scroll without
//     forcing them to type).
//   - Each keystroke after the first character (debounced 300ms)
//     fetches /api/di/schools?q=<value>&limit=20.
//   - Up/Down arrows navigate; Enter selects; Escape closes.
//   - Click outside closes.
//   - "+ Add a new school" link sits at the popover footer; opens
//     the existing inline-create modal (unchanged).
//   - When a value is set, the input displays the school's name
//     and a tiny "Change" link replaces the popover trigger so DIs
//     don't accidentally lose their selection by typing.

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";

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

const DEBOUNCE_MS = 300;

export interface SchoolPickerProps {
  /** Currently selected school UUID, or empty string if none. */
  value: string;
  onChange: (id: string) => void;
  /** Optional initial label for the currently-selected school (when
   * editing an existing child whose school is already linked). */
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
  // Resolved labels keyed by school UUID. Seeded from
  // initialSelectedLabel; grows as we hit the search API and as the
  // DI selects new rows. The displayed label is derived: when a
  // value is set, we look it up here; if missing, we kick off an
  // async lookup that adds to the map (no synchronous setState in
  // an effect — see the value-lookup effect below).
  const [labelMap, setLabelMap] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    if (value && initialSelectedLabel) m.set(value, initialSelectedLabel);
    return m;
  });
  const selectedLabel = value ? labelMap.get(value) ?? null : null;

  // Search input value (only relevant when editing/searching).
  const [query, setQuery] = useState("");
  // Open state of the popover.
  const [open, setOpen] = useState(false);
  // Result list + loading flag.
  const [results, setResults] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(false);
  // Keyboard nav highlight index.
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [showModal, setShowModal] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<number | null>(null);
  const lastFetchedQuery = useRef<string>("__nope__"); // de-dup

  // ─── Fetch ────────────────────────────────────────────────────────
  const fetchSchools = useCallback(async (q: string) => {
    if (lastFetchedQuery.current === q) return;
    lastFetchedQuery.current = q;
    setLoading(true);
    try {
      const url = q.trim().length > 0
        ? `/api/di/schools?q=${encodeURIComponent(q)}&limit=20`
        : "/api/di/schools?limit=20";
      const res = await fetch(url, { cache: "no-store" });
      const body = (res.ok ? await res.json() : { schools: [] }) as {
        schools?: SchoolOption[];
      };
      const schools = Array.isArray(body.schools) ? body.schools : [];
      setResults(schools);
      // Backfill labelMap with anything we just fetched. Cheap.
      if (schools.length > 0) {
        setLabelMap((prev) => {
          const next = new Map(prev);
          for (const s of schools) {
            if (!next.has(s.id)) next.set(s.id, s.name);
          }
          return next;
        });
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce input → fetch. Also handles the initial-open case:
  // when `open` first flips true, this effect runs with query="",
  // schedules a 300ms timer that loads the alphabetical first 20.
  // The 300ms delay is invisible UX-wise and avoids a synchronous
  // setState burst inside the effect body.
  useEffect(() => {
    if (!open) return;
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = window.setTimeout(() => {
      void fetchSchools(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current !== null) {
        window.clearTimeout(debounceTimer.current);
      }
    };
  }, [query, open, fetchSchools]);

  // If parent passes a value with no resolved label, kick off an
  // async lookup. State updates only happen inside the async IIFE
  // (never synchronously in the effect body), so this is safe under
  // the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    if (!value) return;
    if (labelMap.has(value)) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/di/schools?limit=50", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { schools?: SchoolOption[] };
        if (!alive) return;
        const hit = body.schools?.find((s) => s.id === value);
        if (hit) {
          setLabelMap((prev) => {
            if (prev.has(value)) return prev;
            const next = new Map(prev);
            next.set(value, hit.name);
            return next;
          });
        }
      } catch {
        // silent — selectedLabel stays null, the readout shows the
        // UUID. Edge case (admin-entered value or stale row).
      }
    })();
    return () => {
      alive = false;
    };
  }, [value, labelMap]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // ─── Selection helpers ────────────────────────────────────────────
  function pick(s: SchoolOption) {
    setLabelMap((prev) => {
      if (prev.get(s.id) === s.name) return prev;
      const next = new Map(prev);
      next.set(s.id, s.name);
      return next;
    });
    onChange(s.id);
    setQuery("");
    setOpen(false);
    setActiveIdx(-1);
  }

  function clearSelection() {
    onChange("");
    setQuery("");
    setOpen(true);
    // Move focus into the input so the DI can immediately type.
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onCreated(school: SchoolOption) {
    pick(school);
    setShowModal(false);
  }

  // ─── Keyboard nav ──
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIdx((idx) => Math.min(idx + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((idx) => Math.max(idx - 1, 0));
    } else if (e.key === "Enter") {
      if (open && activeIdx >= 0 && activeIdx < results.length) {
        e.preventDefault();
        pick(results[activeIdx]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      {value && selectedLabel ? (
        // SELECTED STATE: pill-style readout with a Change link.
        <div className="flex items-center gap-3">
          <div
            className={`${inputClass} flex items-center justify-between`}
            aria-label="Selected school"
          >
            <span className="truncate text-ink">{selectedLabel}</span>
            <button
              type="button"
              onClick={clearSelection}
              disabled={disabled}
              className="ml-3 inline-flex items-center gap-1 text-[12px] font-medium text-tangerine-deeper hover:underline disabled:opacity-60"
              aria-label="Change school"
            >
              <X className="w-3 h-3 stroke-[2]" aria-hidden="true" />
              Change
            </button>
          </div>
        </div>
      ) : (
        // SEARCH STATE: typeahead input + popover.
        <>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-soft pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls="school-picker-listbox"
              className={`${inputClass} pl-9`}
              placeholder="Type to search schools…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!open) setOpen(true);
                setActiveIdx(-1);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              disabled={disabled}
            />
            {loading ? (
              <Loader2
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tangerine-deeper animate-spin"
                aria-hidden="true"
              />
            ) : null}
          </div>

          {open ? (
            <div
              id="school-picker-listbox"
              role="listbox"
              className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-lg"
            >
              {results.length === 0 ? (
                <div className="px-4 py-3 text-[13.5px] text-ink-soft leading-relaxed">
                  {loading
                    ? "Searching…"
                    : query.trim().length > 0
                      ? "No schools match. Add a new one below."
                      : "Start typing to search."}
                </div>
              ) : (
                <ul className="py-1">
                  {results.map((s, i) => (
                    <li
                      key={s.id}
                      role="option"
                      aria-selected={i === activeIdx}
                      // Use onMouseDown so the click fires before the
                      // input's onBlur/document-click closes the
                      // popover.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(s);
                      }}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`px-4 py-2 cursor-pointer text-[14.5px] leading-snug ${
                        i === activeIdx
                          ? "bg-tangerine-mist/60 text-ink"
                          : "text-ink hover:bg-tangerine-mist/30"
                      }`}
                    >
                      <span className="font-medium">{s.name}</span>
                      {s.type ? (
                        <span className="ml-2 text-[12.5px] text-ink-soft">
                          {SCHOOL_TYPE_LABELS[s.type] ?? s.type}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-stone-200 px-3 py-2 bg-stone-50/60">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowModal(true);
                    setOpen(false);
                  }}
                  disabled={disabled}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-tangerine-deeper hover:underline disabled:opacity-60"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
                  Add a new school
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {showModal ? (
        <SchoolCreateModal
          onClose={() => setShowModal(false)}
          onCreated={onCreated}
          defaultDivision={defaultDivision}
          defaultDistrict={defaultDistrict}
          prefillName={query.trim()}
        />
      ) : null}
    </div>
  );
}

// ─── Inline-create modal ───────────────────────────────────────────
// Session 48b — added prefillName so the modal opens with whatever
// the DI was just typing in the typeahead. Saves a copy/paste step.

function SchoolCreateModal({
  onClose,
  onCreated,
  defaultDivision,
  defaultDistrict,
  prefillName,
}: {
  onClose: () => void;
  onCreated: (school: SchoolOption) => void;
  defaultDivision?: string;
  defaultDistrict?: string;
  prefillName?: string;
}) {
  const [name, setName] = useState(prefillName ?? "");
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
