import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  createItem,
  readItem,
  readItems,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "./directus";
import {
  isPaymentMode,
  isPaymentSchedule,
  isValidAmount,
  isValidDurationMonths,
  type PaymentMode,
  type PaymentSchedule,
} from "./pricing";
import { DEFAULT_CAUSE, isValidCause, type CauseEnum } from "./cause";
import {
  DEFAULT_VISIBILITY,
  isValidVisibility,
  type VisibilityEnum,
} from "./visibility";

// ─── Constants ───────────────────────────────────────────────────────────────
export const CART_COOKIE = "og_cart_token";
const CART_TTL_DAYS = 7;
const CART_TTL_MS = CART_TTL_DAYS * 86_400_000;

export type CartItem = {
  childId: string;
  paymentMode: PaymentMode;
  amountUsd: number;
  // Monthly-only fields. For one_time, both must be null.
  // For monthly indefinite: durationMonths=null, paymentSchedule="monthly".
  // For monthly fixed-term: durationMonths is 1-36, paymentSchedule is
  //   either "monthly" (recurring) or "monthly_prepaid" (single upfront).
  durationMonths: number | null;
  paymentSchedule: PaymentSchedule | null;
  // Donor's stated allocation intent (Session 14.5). Defaults to
  // general_care when the donor doesn't explicitly choose.
  cause: CauseEnum;
  // Donor-controlled public visibility (Session 14.6). Defaults to
  // 'anonymous' (faith-conscious / hidden-sadaqah baseline). Donors
  // opt INTO 'named' to surface their first name on the child's
  // public page.
  visibility: VisibilityEnum;
};

export type HydratedCartItem = CartItem & {
  display_name: string | null;
  // Hotfix R1 — the cart can be hydrated for an UNAUTHENTICATED visitor
  // (cart_token cookie alone, no donor session — see /api/cart/add which
  // passes `donorId: donor?.id ?? null`). District is Tier 2+, so we
  // can't surface it through this shape regardless of who's looking,
  // without splitting the component by tier. Cart UI is slated for
  // retirement separately; force-null here and surface DIVISION via
  // `region` instead.
  district: string | null;
  region: string | null;
  photo: string | null;
};

export type Cart = {
  id: string;
  token: string;
  donorId: string | null;
  items: CartItem[];
  totalAmountUsd: number;
  status: "active" | "converted" | "abandoned" | "expired";
  expiresAt: string | null;
};

export type HydratedCart = {
  id: string;
  token: string;
  donorId: string | null;
  items: HydratedCartItem[];
  // Legacy fields, kept for back-compat with existing checkout/init code
  // that doesn't yet split the buckets. monthlyTotal is the per-month
  // recurring amount; oneTimeTotal is one-time + prepaid (the
  // "charge-today" bucket).
  monthlyTotal: number;
  oneTimeTotal: number;
  // New cart UI surfaces these explicitly. monthly_prepaid is broken
  // out so the cart can show "Today's charge" = prepaid + one-time.
  monthlyRecurringTotal: number;
  monthlyPrepaidTotal: number;
  oneTimeOnlyTotal: number;
  totalAmountUsd: number;
  status: Cart["status"];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function isPlainCartItem(v: unknown): v is CartItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (
    typeof o.childId !== "string" ||
    !UUID_RE.test(o.childId) ||
    typeof o.paymentMode !== "string" ||
    !isPaymentMode(o.paymentMode) ||
    typeof o.amountUsd !== "number" ||
    !isValidAmount(o.paymentMode, o.amountUsd)
  ) {
    return false;
  }
  // durationMonths + paymentSchedule may be missing on legacy cart rows
  // — treat absent as null. We only persist the new shape going forward,
  // but reading older sessions shouldn't 500.
  const durationRaw = o.durationMonths;
  const durationMonths =
    durationRaw === undefined || durationRaw === null
      ? null
      : typeof durationRaw === "number"
        ? durationRaw
        : NaN; // sentinel — fails validation below
  if (Number.isNaN(durationMonths)) return false;
  if (!isValidDurationMonths(o.paymentMode, durationMonths)) return false;

  const scheduleRaw = o.paymentSchedule;
  const paymentSchedule =
    scheduleRaw === undefined || scheduleRaw === null
      ? null
      : isPaymentSchedule(scheduleRaw)
        ? scheduleRaw
        : "__invalid__";
  if (paymentSchedule === "__invalid__") return false;

  // Cross-field invariants:
  // - one_time: schedule must be null.
  // - monthly indefinite: schedule must be "monthly".
  // - monthly fixed-term: schedule must be "monthly" OR "monthly_prepaid".
  if (o.paymentMode === "one_time") {
    if (paymentSchedule !== null) return false;
  } else {
    if (durationMonths === null) {
      if (paymentSchedule !== "monthly") return false;
    } else {
      if (paymentSchedule !== "monthly" && paymentSchedule !== "monthly_prepaid") {
        return false;
      }
    }
  }

  // `cause` was added in Session 14.5. Items persisted before that
  // migration won't have it — default to general_care so legacy
  // carts on disk don't fail this validator. Items where cause IS
  // present must be a recognized enum value; unknown strings are
  // rejected (could indicate a tampered cookie / stale client).
  if ("cause" in o && o.cause !== undefined && o.cause !== null) {
    if (!isValidCause(o.cause)) return false;
  } else {
    o.cause = DEFAULT_CAUSE;
  }
  // `visibility` was added in Session 14.6. Same legacy-tolerant
  // rule as cause: missing/null defaults to anonymous (the privacy-
  // preserving baseline), present-but-unknown is rejected.
  if ("visibility" in o && o.visibility !== undefined && o.visibility !== null) {
    if (!isValidVisibility(o.visibility)) return false;
  } else {
    o.visibility = DEFAULT_VISIBILITY;
  }
  return true;
}

// Totals across the cart. We track 3 buckets that drive the cart's
// "Recurring monthly" / "Today's charge" split:
//   monthlyRecurring  → monthly items charged each month (indefinite or
//                       fixed-term with paymentSchedule='monthly')
//   monthlyPrepaid    → monthly_prepaid items, summed as N × amount
//                       (the entire commitment hits the donor today)
//   oneTime           → one-time gifts
function totalsOf(items: ReadonlyArray<CartItem>): {
  monthlyRecurring: number;
  monthlyPrepaid: number;
  oneTime: number;
} {
  let monthlyRecurring = 0;
  let monthlyPrepaid = 0;
  let oneTime = 0;
  for (const it of items) {
    if (it.paymentMode === "one_time") {
      oneTime += it.amountUsd;
    } else if (it.paymentSchedule === "monthly_prepaid") {
      // durationMonths is required for prepaid (validated above).
      const months = it.durationMonths ?? 0;
      monthlyPrepaid += it.amountUsd * months;
    } else {
      monthlyRecurring += it.amountUsd;
    }
  }
  return { monthlyRecurring, monthlyPrepaid, oneTime };
}

// ─── Cart cookie + record ────────────────────────────────────────────────────
async function readCartTokenFromCookie(): Promise<string | null> {
  const store = await cookies();
  const v = store.get(CART_COOKIE)?.value;
  return v ?? null;
}

async function writeCartTokenCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_TTL_DAYS * 86_400,
  });
}

// Find an existing cart_session row by token. Returns null if missing or
// expired. Donor id, if absent, is treated as null (guest).
async function findCartByToken(token: string): Promise<Cart | null> {
  try {
    const rows = (await directusServer().request(
      readItems("cart_session" as never, {
        filter: {
          _and: [
            { session_token: { _eq: token } },
            { status: { _eq: "active" } },
          ],
        },
        fields: [
          "id", "session_token", "donor", "items",
          "total_amount_usd", "status", "expires_at",
        ],
        limit: 1,
      } as never),
    )) as unknown as Array<{
      id: string;
      session_token: string;
      donor: string | null;
      items: unknown;
      total_amount_usd: string | number;
      status: Cart["status"];
      expires_at: string | null;
    }>;
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return null;

    // Server-side TTL: even if status='active', refuse if expired.
    if (
      row.expires_at &&
      new Date(row.expires_at).getTime() < Date.now()
    ) {
      return null;
    }

    const items: CartItem[] = Array.isArray(row.items)
      ? (row.items as unknown[]).filter(isPlainCartItem)
      : [];
    return {
      id: row.id,
      token: row.session_token,
      donorId: row.donor,
      items,
      totalAmountUsd: Number(row.total_amount_usd ?? 0),
      status: row.status,
      expiresAt: row.expires_at,
    };
  } catch (err) {
    console.warn(
      "[cart-data] findCartByToken failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function createCart(opts: {
  donorId: string | null;
}): Promise<Cart> {
  const token = generateToken();
  const now = new Date();
  const expires = new Date(now.getTime() + CART_TTL_MS).toISOString();
  const created = (await directusServer().request(
    createItem("cart_session" as never, {
      session_token: token,
      donor: opts.donorId,
      items: [],
      total_amount_usd: 0,
      status: "active",
      last_activity_at: now.toISOString(),
      expires_at: expires,
    } as never),
  )) as unknown as { id: string };
  await writeCartTokenCookie(token);
  return {
    id: created.id,
    token,
    donorId: opts.donorId,
    items: [],
    totalAmountUsd: 0,
    status: "active",
    expiresAt: expires,
  };
}

// Persist items + total + bump last_activity. Returns the same Cart shape.
async function persistCart(cart: Cart, nextItems: CartItem[]): Promise<Cart> {
  const totals = totalsOf(nextItems);
  // total_amount_usd represents the *immediate* charge — what the donor
  // is committing to pay today. That's monthly_prepaid (full N months
  // upfront) + one-time gifts. Recurring monthly is excluded; that's a
  // future-charge concept.
  const total = totals.monthlyPrepaid + totals.oneTime;
  const now = new Date();
  const expires = new Date(now.getTime() + CART_TTL_MS).toISOString();
  await directusServer().request(
    updateItem("cart_session" as never, cart.id as never, {
      items: nextItems,
      total_amount_usd: total,
      last_activity_at: now.toISOString(),
      expires_at: expires,
    } as never),
  );
  return {
    ...cart,
    items: nextItems,
    totalAmountUsd: total,
    expiresAt: expires,
  };
}

// Read OR create. Used by add operations.
export async function getOrCreateCart(opts: {
  donorId: string | null;
}): Promise<Cart> {
  const token = await readCartTokenFromCookie();
  if (token) {
    const existing = await findCartByToken(token);
    if (existing) {
      // Sync donor id if it just changed (guest signed in).
      if (
        opts.donorId &&
        existing.donorId !== opts.donorId
      ) {
        try {
          await directusServer().request(
            updateItem("cart_session" as never, existing.id as never, {
              donor: opts.donorId,
            } as never),
          );
          existing.donorId = opts.donorId;
        } catch {
          /* non-fatal */
        }
      }
      return existing;
    }
  }
  return createCart({ donorId: opts.donorId });
}

// Read-only. Returns null if no cookie / no cart / expired.
export async function readCart(): Promise<Cart | null> {
  const token = await readCartTokenFromCookie();
  if (!token) return null;
  return findCartByToken(token);
}

// ─── Hydration (child name + photo for cart UI) ──────────────────────────────
export async function hydrateCart(cart: Cart): Promise<HydratedCart> {
  const ids = Array.from(new Set(cart.items.map((i) => i.childId)));
  // Hotfix R1 — fetch bd_division.name (DIVISION) instead of
  // bd_district.name. Anonymous cart access is possible (see the
  // HydratedCartItem type comment), and district is Tier 2+. Division
  // is the safe public-tier location surface — same contract enforced
  // on /, /children, and /children/[id] in this hotfix.
  let childMap = new Map<string, { display_name: string | null; region: string | null; photo: string | null }>();
  if (ids.length > 0) {
    try {
      const rows = (await directusServer().request(
        readItems("child" as never, {
          filter: { id: { _in: ids } },
          fields: ["id", "display_name", "Photo", "bd_division.name"],
        } as never),
      )) as unknown as Array<{
        id: string;
        display_name?: string | null;
        Photo?: string | null;
        bd_division?: { name?: string | null } | null;
      }>;
      if (Array.isArray(rows)) {
        for (const r of rows) {
          childMap.set(String(r.id), {
            display_name: r.display_name?.trim() ?? null,
            region: r.bd_division?.name?.trim() ?? null,
            photo: r.Photo ?? null,
          });
        }
      }
    } catch (err) {
      console.warn(
        "[cart-data] hydrate failed",
        err instanceof Error ? err.message : err,
      );
    }
  }
  const items: HydratedCartItem[] = cart.items.map((it) => {
    const c = childMap.get(it.childId);
    return {
      ...it,
      display_name: c?.display_name ?? null,
      // Hotfix R1 — bd_district is no longer fetched; district is
      // always null on the cart payload. Field kept on the type for
      // shape compatibility.
      district: null,
      region: c?.region ?? null,
      photo: c?.photo ?? null,
    };
  });
  const totals = totalsOf(cart.items);
  return {
    id: cart.id,
    token: cart.token,
    donorId: cart.donorId,
    items,
    // Legacy aliases. monthlyTotal still means "per-month recurring";
    // oneTimeTotal now includes the prepaid bucket so existing checkout
    // code that sums (monthlyTotal recurring) + (oneTimeTotal upfront)
    // produces a correct "what the donor is committing to right now"
    // pair. Net behaviour unchanged for existing single-mode carts.
    monthlyTotal: totals.monthlyRecurring,
    oneTimeTotal: totals.oneTime + totals.monthlyPrepaid,
    monthlyRecurringTotal: totals.monthlyRecurring,
    monthlyPrepaidTotal: totals.monthlyPrepaid,
    oneTimeOnlyTotal: totals.oneTime,
    totalAmountUsd: cart.totalAmountUsd,
    status: cart.status,
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────
export async function addOrUpdateItem(opts: {
  donorId: string | null;
  item: CartItem;
}): Promise<Cart> {
  if (!isPlainCartItem(opts.item)) {
    throw new Error("Invalid cart item.");
  }
  const cart = await getOrCreateCart({ donorId: opts.donorId });
  // Dedup by childId+paymentMode — if exists, replace amount.
  const next = cart.items.filter(
    (i) =>
      !(
        i.childId === opts.item.childId &&
        i.paymentMode === opts.item.paymentMode
      ),
  );
  next.push(opts.item);
  return persistCart(cart, next);
}

export async function removeItem(opts: {
  childId: string;
  paymentMode: PaymentMode;
}): Promise<Cart | null> {
  const token = await readCartTokenFromCookie();
  if (!token) return null;
  const cart = await findCartByToken(token);
  if (!cart) return null;
  const next = cart.items.filter(
    (i) =>
      !(i.childId === opts.childId && i.paymentMode === opts.paymentMode),
  );
  if (next.length === cart.items.length) return cart;
  return persistCart(cart, next);
}

export async function clearCart(): Promise<void> {
  const token = await readCartTokenFromCookie();
  if (!token) return;
  const cart = await findCartByToken(token);
  if (!cart) return;
  await persistCart(cart, []);
}

// Pure mapper from a Sponsorship row back to the CartItem shape that
// produced it. Used by the resume-pending flow: when a donor clicks
// "Complete payment →" on a stuck pending_payment card, we look up
// the sponsorship row and reconstruct the cart item so the donor sees
// their original selection in /checkout.
//
// The row's `child` may arrive as either a string id (when fields
// requested without expansion) or an expanded child object — handle both.
//
// Cause defaults to general_care when the row pre-dates the Session 14.5
// migration (`null` cause). Same fallback as labelForCause().
//
// Visibility defaults to 'anonymous' when the row pre-dates Session 14.6
// (`null` visibility). Privacy-preserving baseline so legacy data never
// accidentally surfaces a donor name when reconstructed into a cart.
//
// TODO (Session 16): if the original cart was a multi-child bundle, this
// helper only reconstructs the SINGLE item the donor clicked. Resuming
// the full bundle would require persisting the original cart_session id
// on each sponsorship row at create time.
export function cartItemFromSponsorship(
  s: import("./sponsorship-data").Sponsorship,
): CartItem {
  const childId = typeof s.child === "string" ? s.child : s.child.id;
  const cause: CauseEnum =
    s.cause && (CAUSE_VALUES as ReadonlySet<string>).has(s.cause)
      ? (s.cause as CauseEnum)
      : DEFAULT_CAUSE;
  const visibility: VisibilityEnum =
    s.visibility && (VISIBILITY_VALUES as ReadonlySet<string>).has(s.visibility)
      ? (s.visibility as VisibilityEnum)
      : DEFAULT_VISIBILITY;
  return {
    childId,
    paymentMode: s.payment_mode,
    amountUsd: s.amount_usd,
    durationMonths: s.duration_months,
    paymentSchedule: s.payment_schedule,
    cause,
    visibility,
  };
}

// Subset of CauseEnum values for the runtime-validation check above.
// Keeping a local Set rather than importing isValidCause from cause.ts
// avoids creating a circular module reference (cart-data is imported
// widely; cause.ts is a leaf).
const CAUSE_VALUES: ReadonlySet<string> = new Set([
  "general_care",
  "education",
  "healthcare",
  "food",
  "eid_gift",
]);

// Same pattern as CAUSE_VALUES — local Set for the
// cartItemFromSponsorship guard. visibility.ts is a leaf module too,
// but matching the existing local-Set convention here keeps the file's
// import surface consistent.
const VISIBILITY_VALUES: ReadonlySet<string> = new Set([
  "anonymous",
  "named",
]);

// Verify a child exists and is currently active. Used at /api/cart/add to
// reject items that point at non-active or non-existent children.
export async function isChildAvailable(childId: string): Promise<boolean> {
  if (!UUID_RE.test(childId)) return false;
  try {
    const row = (await directusServer().request(
      readItem("child" as never, childId as never, {
        fields: ["id", "status"],
      } as never),
    )) as unknown as { id?: string; status?: string } | null;
    return Boolean(row?.id) && row?.status === "active";
  } catch {
    return false;
  }
}

export function cartItemCount(cart: Cart | null): number {
  return cart?.items.length ?? 0;
}

// Webhook-friendly: mark all of a donor's active carts as 'converted'.
// Uses donor id (not the cookie token), since webhooks don't have the
// donor's session cookie. Used after successful payment to prevent the
// donor from re-checking-out the same items.
export async function clearCartByDonor(donorId: string): Promise<void> {
  if (!UUID_RE.test(donorId)) return;
  try {
    const rows = (await directusServer().request(
      readItems("cart_session" as never, {
        filter: {
          _and: [
            { donor: { _eq: donorId } },
            { status: { _eq: "active" } },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }>;
    for (const row of rows ?? []) {
      try {
        await directusServer().request(
          updateItem("cart_session" as never, row.id as never, {
            status: "converted",
            items: [],
            total_amount_usd: 0,
          } as never),
        );
      } catch (err) {
        console.warn(
          `[cart-data] clearCartByDonor: update ${row.id} failed`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    console.warn(
      "[cart-data] clearCartByDonor failed",
      err instanceof Error ? err.message : err,
    );
  }
}
