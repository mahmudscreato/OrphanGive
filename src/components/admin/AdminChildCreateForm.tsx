// Admin direct-CREATE child form. Thin wrapper around the shared ChildFieldSet
// (identical field set to the edit form). POSTs to /api/admin/children, which
// writes a child at status='awaiting_intake' (NOT public), attributed to the
// creating admin. On success routes to /admin/children/[id] to review +
// PUBLISH via the existing reactivate action.

"use client";

import { useRouter } from "next/navigation";
import type { BdDistrictOption } from "@/lib/di-children";
import { ChildFieldSet } from "@/components/admin/ChildFieldSet";

export function AdminChildCreateForm({
  districts,
}: {
  districts: BdDistrictOption[];
}) {
  const router = useRouter();

  async function handleSubmit(
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      const res = await fetch("/api/admin/children", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        childId?: string;
        message?: string;
        issues?: Array<{ path?: string; message?: string }>;
      };
      if (!res.ok || !data.childId) {
        return data.issues?.[0]
          ? `${data.issues[0].path}: ${data.issues[0].message}`
          : data.message ?? "Couldn't create the child. Try again.";
      }
      router.push(`/admin/children/${data.childId}`);
      return null;
    } catch {
      return "Network error. Try again.";
    }
  }

  return (
    <ChildFieldSet
      districts={districts}
      mode="create"
      submitLabel="Create child (awaiting intake)"
      submittingLabel="Creating…"
      cancelHref="/admin/children"
      onSubmit={handleSubmit}
      intro={
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          This creates the child as <strong>Awaiting intake</strong> — not
          public and not sponsorable. Review on the next screen, then{" "}
          <strong>Publish</strong> to make it live (required fields are enforced
          at publish).
        </p>
      }
    />
  );
}
