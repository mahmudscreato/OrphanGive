// Session 45 — DI aid_delivery data layer.
//
// Schema reality (from Session 45 discovery):
//
//   aid_delivery columns:
//     id            uuid PK
//     child         uuid M2O child  NOT NULL
//     sponsorship   uuid M2O sponsorship  NULLABLE
//     aid_type      text   NOT NULL  enum: education|food|healthcare
//                                          |clothing|general_care|other
//     description   text   NULLABLE  ← required server-side for UX
//     delivery_date date   NULLABLE  ← required server-side
//     photo         uuid   NULLABLE  ← required server-side (evidence)
//     recipient_acknowledgment text  NULLABLE
//     status        text   NOT NULL  default 'pending'
//                          enum: pending|verified|rejected
//     rejection_reason text  NULLABLE
//     delivered_by  uuid   NOT NULL
//     verified_by   uuid   NULLABLE
//     date_created  timestamp NULLABLE  no auto-default
//     verified_at   timestamp NULLABLE
//
// Even though several columns are nullable in DB, the form workflow
// requires them all (description, delivery_date, photo). That gating
// happens here in the data layer so the API route can map cleanly to
// 400 responses regardless of where the bypass attempt comes from.

import "server-only";

import { createItem, readItems, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";
import { getDiChildById, getDiChildSponsorships } from "./di-children";
// AID_TYPE_OPTIONS + AidType live in a non-`server-only` module so
// the client DeliveryForm can import them without dragging this
// file's server deps into the bundle. Re-exported below for symmetry.
import {
  AID_TYPE_OPTIONS as AID_TYPE_OPTIONS_VALUE,
  type AidType,
} from "./di-delivery-options";

// ─── Public types ───────────────────────────────────────────────────

export type { AidType };

export type DeliveryStatus = "pending" | "verified" | "rejected";

export interface CreateDeliveryInput {
  childId: string;
  sponsorshipId?: string;
  aidType: AidType;
  description: string;
  deliveryDate: string; // YYYY-MM-DD
  photoUuid: string; // required
  recipientAcknowledgment?: string;
}

export interface DeliverySummary {
  id: string;
  aidType: AidType;
  description: string;
  deliveryDate: string | null;
  photoUrl: string | null;
  recipientAcknowledgment: string | null;
  status: DeliveryStatus;
  rejectionReason: string | null;
  // Donor display name when delivery is linked to a sponsorship —
  // resolved via the same redacted Session 43 pipeline.
  sponsorDisplayName: string | null;
  deliveredByName: string;
  isOwn: boolean;
}

// ─── Typed errors ───────────────────────────────────────────────────

export class OutOfScopeError extends Error {
  readonly code = "out_of_scope" as const;
  constructor(message = "Child is not in DI's scope") {
    super(message);
    this.name = "OutOfScopeError";
  }
}

export class InvalidInputError extends Error {
  readonly code = "invalid_input" as const;
  constructor(
    public readonly field: string,
    reason: string,
  ) {
    super(`${field}: ${reason}`);
    this.name = "InvalidInputError";
  }
}

export class SponsorshipNotMatchingError extends Error {
  readonly code = "sponsorship_not_matching" as const;
  constructor(message = "Sponsorship is not linked to this child") {
    super(message);
    this.name = "SponsorshipNotMatchingError";
  }
}

// ─── Static lists (re-exported from the client-safe options module) ─

export const AID_TYPE_OPTIONS = AID_TYPE_OPTIONS_VALUE;

const VALID_AID_TYPES = new Set<string>(AID_TYPE_OPTIONS.map((o) => o.value));

// ─── Validators ─────────────────────────────────────────────────────

function validateDate(field: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidInputError(field, "expected YYYY-MM-DD");
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidInputError(field, "not a real date");
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d.getTime() > today.getTime() + 24 * 60 * 60 * 1000) {
    throw new InvalidInputError(field, "cannot be in the future");
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export async function createDelivery(
  userId: string,
  input: CreateDeliveryInput,
): Promise<{ deliveryId: string }> {
  // Scope guard.
  const child = await getDiChildById(input.childId, userId);
  if (!child) throw new OutOfScopeError();

  // Validation.
  if (!VALID_AID_TYPES.has(input.aidType)) {
    throw new InvalidInputError("aidType", "invalid value");
  }
  if (!input.description || input.description.trim().length === 0) {
    throw new InvalidInputError("description", "required");
  }
  if (input.description.trim().length > 500) {
    throw new InvalidInputError("description", "max 500 characters");
  }
  validateDate("deliveryDate", input.deliveryDate);
  if (!input.photoUuid || input.photoUuid.length < 8) {
    throw new InvalidInputError("photoUuid", "required");
  }
  if (
    input.recipientAcknowledgment &&
    input.recipientAcknowledgment.trim().length > 1000
  ) {
    throw new InvalidInputError(
      "recipientAcknowledgment",
      "max 1000 characters",
    );
  }

  // Sponsorship link validation.
  if (input.sponsorshipId) {
    const sponsorships = await getDiChildSponsorships(
      input.childId,
      userId,
    );
    const matches = (sponsorships ?? []).some(
      (s) => s.id === input.sponsorshipId,
    );
    if (!matches) {
      throw new SponsorshipNotMatchingError();
    }
  }

  const created = (await directusServer().request(
    createItem("aid_delivery" as never, {
      child: input.childId,
      ...(input.sponsorshipId ? { sponsorship: input.sponsorshipId } : {}),
      aid_type: input.aidType,
      description: input.description.trim(),
      delivery_date: input.deliveryDate,
      photo: input.photoUuid,
      ...(input.recipientAcknowledgment?.trim()
        ? { recipient_acknowledgment: input.recipientAcknowledgment.trim() }
        : {}),
      status: "pending",
      delivered_by: userId,
      // No auto-default on date_created — set explicitly for relative-
      // time formatting on fresh inserts.
      date_created: new Date().toISOString(),
    } as never),
  )) as unknown as { id?: string } | undefined;

  const id = created?.id;
  if (!id) {
    throw new Error("[di-deliveries] createDelivery: no id returned");
  }
  return { deliveryId: String(id) };
}

type DeliveryRow = {
  id: string;
  aid_type: string | null;
  description: string | null;
  delivery_date: string | null;
  photo: string | null;
  recipient_acknowledgment: string | null;
  status: string | null;
  rejection_reason: string | null;
  delivered_by: string | null;
  sponsorship: string | null;
};

const DELIVERY_FIELDS = [
  "id",
  "aid_type",
  "description",
  "delivery_date",
  "photo",
  "recipient_acknowledgment",
  "status",
  "rejection_reason",
  "delivered_by",
  "sponsorship",
] as const;

function isAidType(s: string | null | undefined): s is AidType {
  return s !== null && s !== undefined && VALID_AID_TYPES.has(s);
}

function isStatus(s: string | null | undefined): s is DeliveryStatus {
  return s === "pending" || s === "verified" || s === "rejected";
}

export async function listDeliveriesForChild(
  userId: string,
  childId: string,
): Promise<DeliverySummary[]> {
  const child = await getDiChildById(childId, userId);
  if (!child) return [];

  let rows: DeliveryRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("aid_delivery" as never, {
        filter: { child: { _eq: childId } },
        fields: [...DELIVERY_FIELDS],
        sort: ["-delivery_date", "-id"],
        limit: -1,
      } as never),
    )) as unknown as DeliveryRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-deliveries] listDeliveriesForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  if (rows.length === 0) return [];

  // Resolve deliverer names + sponsor display names for linked
  // sponsorships in two batched queries.
  const delivererIds = Array.from(
    new Set(rows.map((r) => r.delivered_by).filter((x): x is string => !!x)),
  );
  const nameById = new Map<string, string>();
  if (delivererIds.length > 0) {
    try {
      const users = (await directusServer().request(
        readUsers({
          filter: { id: { _in: delivererIds } },
          fields: ["id", "first_name"],
          limit: -1,
        } as never),
      )) as unknown as Array<{ id: string; first_name: string | null }> | undefined;
      if (Array.isArray(users)) {
        for (const u of users) {
          if (u.first_name?.trim()) nameById.set(u.id, u.first_name.trim());
        }
      }
    } catch (err) {
      console.warn(
        "[di-deliveries] deliverer name resolution failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Sponsor display names — reuse the redacted Session 43 path.
  // Single fetch of the child's sponsorships, then look up by id.
  const sponsorIdsSet = new Set(
    rows.map((r) => r.sponsorship).filter((x): x is string => !!x),
  );
  const sponsorNameById = new Map<string, string>();
  if (sponsorIdsSet.size > 0) {
    const sponsorships = await getDiChildSponsorships(childId, userId);
    for (const s of sponsorships ?? []) {
      if (sponsorIdsSet.has(s.id)) {
        sponsorNameById.set(s.id, s.donor_display_name);
      }
    }
  }

  return rows.map((r) => {
    const isOwn = r.delivered_by === userId;
    const delivererName = isOwn
      ? "You"
      : r.delivered_by
        ? nameById.get(r.delivered_by) ?? "Unknown"
        : "Unknown";
    return {
      id: r.id,
      aidType: isAidType(r.aid_type) ? r.aid_type : "other",
      description: r.description?.trim() ?? "",
      deliveryDate: r.delivery_date,
      photoUrl: r.photo ? `/api/assets/${r.photo}` : null,
      recipientAcknowledgment: r.recipient_acknowledgment?.trim() ?? null,
      status: isStatus(r.status) ? r.status : "pending",
      rejectionReason: r.rejection_reason,
      sponsorDisplayName: r.sponsorship
        ? sponsorNameById.get(r.sponsorship) ?? null
        : null,
      deliveredByName: delivererName,
      isOwn,
    };
  });
}
