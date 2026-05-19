// Session 58.2 — shared create + edit form for donation_package.
//
// Used by both /admin/donation-packages/new and /[id]/. Posts to the
// appropriate route based on `mode`. Client-side validates the same
// fields the server enforces; the server is still the source of
// truth.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PackageInput } from "@/lib/admin-donation-actions";
import type { DonationPackage } from "@/lib/donation-packages";

const SUPPORT_TYPE_OPTIONS = [
  "education",
  "food",
  "healthcare",
  "clothing",
  "general_care",
  "other",
] as const;

interface CreateProps {
  mode: "create";
  initial?: undefined;
}
interface EditProps {
  mode: "edit";
  initial: DonationPackage;
}
type Props = CreateProps | EditProps;

const EMPTY: PackageInput = {
  package_type: "monthly",
  display_order: 0,
  is_active: true,
  name_en: "",
  name_bn: null,
  description_en: "",
  description_bn: null,
  amount_bdt: 0,
  support_types: [],
  cause_tag: null,
  icon: null,
  duration_months: null,
};

export function DonationPackageForm(props: Props) {
  const router = useRouter();
  const [state, setState] = useState<PackageInput>(() => {
    if (props.mode === "edit") {
      return {
        package_type: props.initial.package_type,
        display_order: props.initial.display_order,
        is_active: props.initial.is_active,
        name_en: props.initial.name_en,
        name_bn: props.initial.name_bn,
        description_en: props.initial.description_en,
        description_bn: props.initial.description_bn,
        amount_bdt: props.initial.amount_bdt,
        support_types: props.initial.support_types,
        cause_tag: props.initial.cause_tag,
        icon: props.initial.icon,
        duration_months: props.initial.duration_months,
      };
    }
    return { ...EMPTY };
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof PackageInput>(k: K, v: PackageInput[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  function toggleSupport(t: string) {
    setState((s) => {
      const has = s.support_types.includes(t);
      return {
        ...s,
        support_types: has
          ? s.support_types.filter((x) => x !== t)
          : [...s.support_types, t],
      };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client validation mirrors server.
    if (!state.name_en.trim()) {
      setError("Name (English) is required");
      return;
    }
    if (!state.description_en.trim()) {
      setError("Description (English) is required");
      return;
    }
    if (!Number.isInteger(state.amount_bdt) || state.amount_bdt < 1) {
      setError("Amount must be a positive integer in BDT");
      return;
    }
    if (state.package_type === "one_time" && state.duration_months !== null) {
      setError("Duration months only applies to monthly packages");
      return;
    }

    const url =
      props.mode === "create"
        ? "/api/admin/donation-packages/create"
        : `/api/admin/donation-packages/${props.initial.id}/edit`;

    startTransition(async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.message || json.error || "Save failed");
          return;
        }
        router.push("/admin/donation-packages");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Row label="Package type">
        <select
          value={state.package_type}
          onChange={(e) => {
            const v = e.target.value as PackageInput["package_type"];
            set("package_type", v);
            if (v === "one_time") set("duration_months", null);
          }}
          className={inputCls}
        >
          <option value="monthly">Monthly</option>
          <option value="one_time">One-time</option>
        </select>
      </Row>

      <Row label="Name (English)">
        <input
          type="text"
          value={state.name_en}
          onChange={(e) => set("name_en", e.target.value)}
          className={inputCls}
          required
        />
      </Row>

      <Row label="Name (Bengali, optional)">
        <input
          type="text"
          value={state.name_bn ?? ""}
          onChange={(e) =>
            set("name_bn", e.target.value.trim() === "" ? null : e.target.value)
          }
          className={inputCls}
        />
      </Row>

      <Row label="Description (English)">
        <textarea
          value={state.description_en}
          onChange={(e) => set("description_en", e.target.value)}
          rows={3}
          className={inputCls}
          required
        />
      </Row>

      <Row label="Description (Bengali, optional)">
        <textarea
          value={state.description_bn ?? ""}
          onChange={(e) =>
            set(
              "description_bn",
              e.target.value.trim() === "" ? null : e.target.value,
            )
          }
          rows={3}
          className={inputCls}
        />
      </Row>

      <Row label="Amount (BDT, per charge)">
        <input
          type="number"
          min={1}
          value={state.amount_bdt || ""}
          onChange={(e) => set("amount_bdt", parseInt(e.target.value, 10) || 0)}
          className={inputCls}
          required
        />
        <p className="mt-1 text-[12px] text-ink-soft">
          For prepaid bundles, this is the per-MONTH amount. The donor is
          charged amount × duration_months.
        </p>
      </Row>

      {state.package_type === "monthly" ? (
        <Row label="Duration months (prepaid only; blank = open-ended)">
          <input
            type="number"
            min={1}
            value={state.duration_months ?? ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              set(
                "duration_months",
                Number.isFinite(n) && n > 0 ? n : null,
              );
            }}
            className={inputCls}
          />
          <p className="mt-1 text-[12px] text-ink-soft">
            Leave blank for open-ended monthly subscription. Enter N for a
            prepaid bundle of N months (single upfront charge).
          </p>
        </Row>
      ) : null}

      <Row label="Support types">
        <div className="flex flex-wrap gap-2">
          {SUPPORT_TYPE_OPTIONS.map((t) => {
            const on = state.support_types.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleSupport(t)}
                className={`rounded-full px-3 py-1 text-[12.5px] ${
                  on
                    ? "bg-tangerine-deep text-white"
                    : "bg-stone-100 text-ink-soft hover:bg-stone-200"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="Cause tag (one-time only; e.g. feed-a-child)">
        <input
          type="text"
          value={state.cause_tag ?? ""}
          onChange={(e) =>
            set(
              "cause_tag",
              e.target.value.trim() === "" ? null : e.target.value,
            )
          }
          className={inputCls}
        />
      </Row>

      <Row label="Icon (Lucide name, e.g. BookOpen)">
        <input
          type="text"
          value={state.icon ?? ""}
          onChange={(e) =>
            set("icon", e.target.value.trim() === "" ? null : e.target.value)
          }
          className={inputCls}
        />
      </Row>

      <Row label="Display order">
        <input
          type="number"
          value={state.display_order}
          onChange={(e) => set("display_order", parseInt(e.target.value, 10) || 0)}
          className={inputCls}
        />
      </Row>

      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={state.is_active}
          onChange={(e) => set("is_active", e.target.checked)}
          className="accent-tangerine"
        />
        Active (showing on public flows)
      </label>

      {error ? (
        <p className="text-[13px] text-rose-700">{error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full bg-orange-solid px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-tangerine-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : props.mode === "create" ? "Create package" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/donation-packages")}
          className="text-[13.5px] text-ink-soft hover:text-tangerine-deeper underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-ink mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
