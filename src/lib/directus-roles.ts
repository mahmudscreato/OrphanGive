import { readRoles } from "@directus/sdk";
import { directusServer } from "./directus";

// The Directus role names that count as "a donor". Donor signup assigns
// 'Donor' (see getDonorRoleId); 'Org Donor' is the organisational-donor
// role. EVERY admin donor query (list / count / detail) must scope to these
// so non-donor users — Admin, Administrator, Super Admin, Data Inputter,
// Legal Guardian, and the service accounts (public-site@, system@) — can
// NEVER appear in, or be acted on through, the donor admin surface.
export const DONOR_ROLE_NAMES = ["Donor", "Org Donor"] as const;

// Reusable Directus filter fragment: user's related role.name ∈ donor roles.
export const DONOR_ROLE_FILTER = {
  role: { name: { _in: [...DONOR_ROLE_NAMES] } },
} as const;

// Cache the Donor role id per-process so we don't refetch on every signup.
let cachedDonorRoleId: string | null = null;

export async function getDonorRoleId(): Promise<string> {
  if (cachedDonorRoleId) return cachedDonorRoleId;
  const rows = (await directusServer().request(
    readRoles({ filter: { name: { _eq: "Donor" } }, fields: ["id"], limit: 1 }),
  )) as Array<{ id: string }>;
  const id = rows?.[0]?.id;
  if (!id) {
    throw new Error("Donor role not found in Directus. Create a role named 'Donor' first.");
  }
  cachedDonorRoleId = id;
  return id;
}
