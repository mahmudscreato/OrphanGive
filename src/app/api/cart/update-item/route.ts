// Update existing item: matched by (childId, paymentMode), replaces amount.
// Implementation: same logic as POST /api/cart/add — addOrUpdateItem
// already de-duplicates and replaces. Routing here is sugar for clarity.
export { POST } from "../add/route";
export const runtime = "nodejs";
