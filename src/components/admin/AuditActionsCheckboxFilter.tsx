// Session 67.1 hotfix — checkbox list for the audit-log "actions"
// filter, replacing the native <select multiple> the Session 67
// page shipped.
//
// Why replace: the native multi-select required Cmd/Ctrl-click for
// multiple selection. Admin team kept reporting only one action
// matched because they hadn't learned the modifier-key trick.
// Checkboxes are unambiguous, no hidden gestures, and the bordered
// card visually reads as "you can pick several here".
//
// URL state stays identical (?actions=a,b,c). The component renders
// a hidden <input name="actions"> the parent <form method="GET">
// reads on submit; we keep the page's existing form-submit model
// rather than juggling client-side fetching.
//
// Implementation:
//   - Controlled component, initial state hydrated from the page's
//     `actions` URL param (passed via the `defaultValue` prop)
//   - Each known action renders as <label><input type=checkbox>…
//   - "Clear all" link wipes selected set
//   - On change, write the joined value into the hidden input so
//     the parent form submission carries the right query string
//
// Session 67.2 hotfix — the original prop API took `options:
// string[]` and `labelFor: (action) => string`. Functions can't
// cross the RSC boundary, so React threw on render:
//   "Functions cannot be passed directly to Client Components …"
// Pre-resolve labels on the server now: `options` is an array of
// {value, label} pairs and the component renders `opt.label`
// directly with no function call.

"use client";

import { useState } from "react";
import { Search } from "lucide-react";

export interface AuditActionOption {
  /** Underlying enum string written into the URL ?actions= param
   * and matched against audit_log rows. */
  value: string;
  /** Pre-resolved human label, computed on the server via
   * formatActionLabel before crossing the RSC boundary. */
  label: string;
}

interface Props {
  /** Every available action from listAdminAuditPage, paired with a
   * server-resolved label. Already sorted alphabetically by the
   * data layer; we render them in the same order. */
  options: ReadonlyArray<AuditActionOption>;
  /** Initially-checked action values, from the URL `?actions=…`
   * param. */
  defaultValue: ReadonlyArray<string>;
}

export function AuditActionsCheckboxFilter({
  options,
  defaultValue,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultValue),
  );
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const filteredOptions = trimmed
    ? options.filter(
        (opt) =>
          opt.value.toLowerCase().includes(trimmed) ||
          opt.label.toLowerCase().includes(trimmed),
      )
    : options;

  function toggle(action: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
  }

  // Hidden input the parent form picks up on GET submit. Joining
  // with "," keeps the URL shape the page's existing parseActions()
  // expects.
  const hiddenValue = Array.from(selected).join(",");

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-2.5">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium">
          Actions{" "}
          {selected.size > 0 ? (
            <span className="text-tangerine-deeper normal-case font-sans tracking-normal">
              · {selected.size} picked
            </span>
          ) : null}
        </span>
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="text-[11px] text-ink-soft hover:text-tangerine-deeper underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {/* In-list search — useful once the action vocabulary grows
          past a screenful. Pure client filter, doesn't affect the
          submitted value. */}
      {options.length > 6 ? (
        <div className="relative mb-2">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-soft pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter actions…"
            className="w-full pl-7 pr-2 py-1 rounded border border-stone-200 bg-stone-50 text-[12px] text-ink placeholder:text-ink-soft focus:outline-none focus:border-tangerine"
          />
        </div>
      ) : null}

      <div className="max-h-[180px] overflow-y-auto space-y-0.5 px-1">
        {filteredOptions.length === 0 ? (
          <p className="text-[11.5px] text-ink-soft italic py-2">
            {options.length === 0
              ? "No actions recorded yet."
              : "No actions match."}
          </p>
        ) : (
          filteredOptions.map((opt) => {
            const isChecked = selected.has(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2 py-1 px-1.5 rounded cursor-pointer text-[12.5px] ${
                  isChecked ? "bg-tangerine-mist/40" : "hover:bg-stone-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(opt.value)}
                  className="accent-tangerine"
                />
                <span className="text-ink truncate" title={opt.value}>
                  {opt.label}
                </span>
              </label>
            );
          })
        )}
      </div>

      <input type="hidden" name="actions" value={hiddenValue} />

      <p className="mt-2 px-1 text-[11px] text-ink-soft">
        {selected.size === 0
          ? "No filter — showing all actions."
          : selected.size === 1
            ? "1 action selected."
            : `${selected.size} actions selected.`}
      </p>
    </div>
  );
}
