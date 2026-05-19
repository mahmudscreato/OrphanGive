// Session 58.2 — currency-picker server action.
//
// The currency picker on /donate (and /sponsor/[childId]) is the only
// client-state piece on those server-rendered pages. Selection writes
// the og_currency cookie via this action and revalidates the path so
// the picker's parent picks up the new amounts on next render.

"use server";

import { revalidatePath } from "next/cache";
import { setDonorCurrency } from "@/lib/geo-currency";

export async function setDonorCurrencyAction(code: string, fromPath: string) {
  await setDonorCurrency(code);
  // Trigger the parent page to re-render with the new currency so
  // package amounts update without a full client reload. The picker
  // also re-mounts and reflects the new selection from the cookie.
  revalidatePath(fromPath);
}
