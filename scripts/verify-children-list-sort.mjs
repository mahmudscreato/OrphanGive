// Session 17 — verify the new /children sort by `date_created` works
// against the live Directus schema. If `date_created` isn't a
// queryable field, the request errors and the new page silently
// falls back to an empty grid.
//
// Usage:
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node scripts/verify-children-list-sort.mjs

import { createDirectus, rest, staticToken, readItems } from "@directus/sdk";

const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const token = process.env.DIRECTUS_SERVER_TOKEN;
if (!url || !token) {
  console.error("Missing env (NEXT_PUBLIC_DIRECTUS_URL / DIRECTUS_SERVER_TOKEN)");
  process.exit(1);
}

const directus = createDirectus(url).with(staticToken(token)).with(rest());

try {
  const rows = await directus.request(
    readItems("child", {
      filter: { status: { _eq: "active" } },
      fields: ["id", "display_name", "approved_at", "bd_division.name"],
      sort: ["approved_at", "display_name"],
      limit: -1,
    }),
  );
  console.log(`Returned ${rows.length} active children, longest-waiting first:\n`);
  console.log("| # | id | display_name | approved_at | division |");
  console.log("|---|---|---|---|---|");
  rows.forEach((r, i) => {
    console.log(
      `| ${i + 1} | ${r.id} | ${r.display_name ?? "—"} | ${r.approved_at ?? "—"} | ${r.bd_division?.name ?? "—"} |`,
    );
  });
  console.log("\n✓ sort by `approved_at` is supported");
} catch (err) {
  console.error("✗ query failed:", err?.errors ?? err);
  process.exit(1);
}
