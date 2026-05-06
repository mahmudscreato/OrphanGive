import { readRoles } from "@directus/sdk";
import { directusServer } from "./directus";

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
