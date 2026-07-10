// Admin direct-EDIT child form. Thin wrapper around the shared ChildFieldSet
// (identical field set to the create form — all 39 editable fields, pre-filled
// from the child's current values). POSTs to /api/admin/children/[id]/edit,
// which routes through editChildAsAdmin (change-detection + the don't-blank-
// required guard). On success returns to the child detail page.
//
// Was previously a hand-coded 12-field form; now shares ChildFieldSet so
// admins can edit EVERY field (incl. all required-to-publish ones + photo).

"use client";

import { useRouter } from "next/navigation";
import type { BdDistrictOption } from "@/lib/di-children";
import {
  ChildFieldSet,
  type ChildInitialValues,
} from "@/components/admin/ChildFieldSet";

export function AdminChildEditForm({
  childId,
  districts,
  initial,
}: {
  childId: string;
  districts: BdDistrictOption[];
  initial: ChildInitialValues;
}) {
  const router = useRouter();

  async function handleSubmit(
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/admin/children/${childId}/edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        issues?: Array<{ path?: string; message?: string }>;
      };
      if (!res.ok) {
        return data.issues?.[0]
          ? `${data.issues[0].path}: ${data.issues[0].message}`
          : data.message ?? "Couldn't save the changes. Try again.";
      }
      router.push(`/admin/children/${childId}`);
      return null;
    } catch {
      return "Network error. Try again.";
    }
  }

  return (
    <ChildFieldSet
      districts={districts}
      initial={initial}
      mode="edit"
      submitLabel="Save changes"
      submittingLabel="Saving…"
      cancelHref={`/admin/children/${childId}`}
      onSubmit={handleSubmit}
    />
  );
}
