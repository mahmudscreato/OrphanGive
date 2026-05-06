// Server-only helper to recompute and persist `child.documents_status`.
//
// Required document set (any verified instance counts):
//   - DEATH_CERTIFICATE_FATHER
//   - DEATH_CERTIFICATE_MOTHER
//   - BIRTH_CERTIFICATE
//   - SCHOOL_RECOMMENDATION  OR  MADRASA_RECOMMENDATION (interchangeable)
//
// Status mapping:
//   complete = all 4 required types verified
//   partial  = at least 1 verified, but not all 4
//   missing  = no verified documents
//
// This is the helper-fallback to a Directus Flow. Admins can call
// `recomputeChildDocumentsStatus(id)` on demand, or `recomputeAllChildren()`
// from a one-shot script. Runbook entry below the code.

import { readItems, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";

export type DocumentsStatus = "complete" | "partial" | "missing";

const REQUIRED_TYPES = [
  "DEATH_CERTIFICATE_FATHER",
  "DEATH_CERTIFICATE_MOTHER",
  "BIRTH_CERTIFICATE",
  // School and madrasa recommendation are interchangeable; either satisfies
  // this slot.
  ["SCHOOL_RECOMMENDATION", "MADRASA_RECOMMENDATION"] as const,
] as const;

type DocumentRow = {
  type: string;
  status: string;
};

export function deriveStatus(
  documents: ReadonlyArray<DocumentRow>,
): DocumentsStatus {
  const verifiedTypes = new Set(
    documents.filter((d) => d.status === "verified").map((d) => d.type),
  );
  if (verifiedTypes.size === 0) return "missing";
  let satisfied = 0;
  for (const slot of REQUIRED_TYPES) {
    if (typeof slot === "string") {
      if (verifiedTypes.has(slot)) satisfied += 1;
    } else {
      if (slot.some((t) => verifiedTypes.has(t))) satisfied += 1;
    }
  }
  return satisfied === REQUIRED_TYPES.length ? "complete" : "partial";
}

export async function recomputeChildDocumentsStatus(
  childId: string,
): Promise<DocumentsStatus> {
  const documents = (await directusServer().request(
    readItems("child_document" as never, {
      filter: { child: { _eq: childId } },
      fields: ["type", "status"],
      limit: -1,
    } as never),
  )) as unknown as DocumentRow[];

  const status = deriveStatus(Array.isArray(documents) ? documents : []);

  await directusServer().request(
    updateItem("child" as never, childId as never, {
      documents_status: status,
    } as never),
  );

  return status;
}

export async function recomputeAllChildren(): Promise<
  Array<{ id: string; status: DocumentsStatus }>
> {
  const children = (await directusServer().request(
    readItems("child" as never, {
      fields: ["id"],
      limit: -1,
    } as never),
  )) as unknown as Array<{ id: string }>;

  const results: Array<{ id: string; status: DocumentsStatus }> = [];
  for (const c of children) {
    const status = await recomputeChildDocumentsStatus(c.id);
    results.push({ id: c.id, status });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operations runbook — manual recompute
// ─────────────────────────────────────────────────────────────────────────────
//
// When child_document records change (insert / update / delete), the parent
// child's `documents_status` does NOT auto-update — there is no Directus Flow
// wired up. Until a Flow is added in the admin UI, recompute manually:
//
// 1. Single child:
//      // From a Server Component / route handler / server action:
//      import { recomputeChildDocumentsStatus } from "@/lib/document-status";
//      await recomputeChildDocumentsStatus(childId);
//
// 2. All active children (one-shot script — useful after bulk imports):
//      // Save as scripts/recompute-docs.mjs and run:
//      //   DIRECTUS_SERVER_TOKEN=... node --experimental-vm-modules scripts/recompute-docs.mjs
//      import { recomputeAllChildren } from "../src/lib/document-status";
//      const results = await recomputeAllChildren();
//      console.log(results);
//
// 3. To replace this helper with a real Directus Flow:
//      Admin UI → Settings → Flows → Create Flow
//      Trigger:   "Event Hook" on child_document for create / update / delete
//      Operation: "Run Script" — call a script that:
//                   a) reads payload.child (the parent id)
//                   b) does the same `deriveStatus` logic above
//                   c) updates the child row
//      The pure logic is exported as `deriveStatus(documents)` so it can be
//      reused inside a Flow Run-Script operation as well.
