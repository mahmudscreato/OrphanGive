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
  isValidAmount,
  type PaymentMode,
} from "./pricing";

// ─── Constants ───────────────────────────────────────────────────────────────
export const CART_COOKIE = "og_cart_token";
const CART_TTL_DAYS = 7;
const CART_TTL_MS = CART_TTL_DAYS * 86_400_000;

export type CartItem = {
  childId: string;
  paymentMode: PaymentMode;
  amountUsd: number;
};

export type HydratedCartItem = CartItem & {
  display_name: string | null;
  district: string | null;
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
  monthlyTotal: number;
  oneTimeTotal: number;
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
  return (
    typeof o.childId === "string" &&
    UUID_RE.test(o.childId) &&
    typeof o.paymentMode === "string" &&
    isPaymentMode(o.paymentMode) &&
    typeof o.amountUsd === "number" &&
    isValidAmount(o.paymentMode, o.amountUsd)
  );
}

function totalsOf(items: ReadonlyArray<CartItem>): {
  monthly: number;
  oneTime: number;
} {
  let monthly = 0;
  let oneTime = 0;
  for (const it of items) {
    if (it.paymentMode === "monthly") monthly += it.amountUsd;
    else oneTime += it.amountUsd;
  }
  return { monthly, oneTime };
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
  const total = totals.monthly + totals.oneTime;
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
  let childMap = new Map<string, { display_name: string | null; district: string | null; photo: string | null }>();
  if (ids.length > 0) {
    try {
      const rows = (await directusServer().request(
        readItems("child" as never, {
          filter: { id: { _in: ids } },
          fields: ["id", "display_name", "Photo", "bd_district.name"],
        } as never),
      )) as unknown as Array<{
        id: string;
        display_name?: string | null;
        Photo?: string | null;
        bd_district?: { name?: string | null } | null;
      }>;
      if (Array.isArray(rows)) {
        for (const r of rows) {
          childMap.set(String(r.id), {
            display_name: r.display_name?.trim() ?? null,
            district: r.bd_district?.name?.trim() ?? null,
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
      district: c?.district ?? null,
      photo: c?.photo ?? null,
    };
  });
  const totals = totalsOf(cart.items);
  return {
    id: cart.id,
    token: cart.token,
    donorId: cart.donorId,
    items,
    monthlyTotal: totals.monthly,
    oneTimeTotal: totals.oneTime,
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
