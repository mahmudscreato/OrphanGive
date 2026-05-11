// Part 5.8 Fix C diagnostic — pull the underlying data behind
// Tile 2 (active children) and Tile 3 (sponsored children)
// then cross-tab to find the math gap.
//
// Run: NEXT_PUBLIC_DIRECTUS_URL=... DIRECTUS_SERVER_TOKEN=... node scripts/diagnose-stats-gap.mjs

import { createDirectus, rest, staticToken, readItems } from "@directus/sdk";

const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const token = process.env.DIRECTUS_SERVER_TOKEN;
if (!url || !token) {
  console.error("Missing NEXT_PUBLIC_DIRECTUS_URL or DIRECTUS_SERVER_TOKEN");
  process.exit(1);
}

const directus = createDirectus(url).with(staticToken(token)).with(rest());
const nowIso = new Date().toISOString();

const sponsorshipRows = await directus.request(
  readItems("sponsorship", {
    filter: {
      _and: [
        { status: { _eq: "active" } },
        {
          _or: [
            { queue_status: { _null: true } },
            { queue_status: { _neq: "queued" } },
          ],
        },
        {
          _or: [
            { payment_schedule: { _eq: "monthly" } },
            {
              _and: [
                { payment_schedule: { _eq: "monthly_prepaid" } },
                {
                  _or: [
                    { scheduled_end_date: { _null: true } },
                    { scheduled_end_date: { _gt: nowIso } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    fields: ["id", "child", "status", "queue_status", "payment_schedule", "scheduled_end_date"],
    limit: -1,
  }),
);

const sponsoredChildIds = new Set();
const sponsoredRowsByChild = new Map();
for (const r of sponsorshipRows) {
  const c = r.child;
  const cid =
    typeof c === "string" || typeof c === "number"
      ? String(c)
      : c && typeof c === "object" && c.id != null
        ? String(c.id)
        : null;
  if (cid) {
    sponsoredChildIds.add(cid);
    if (!sponsoredRowsByChild.has(cid)) sponsoredRowsByChild.set(cid, []);
    sponsoredRowsByChild.get(cid).push(r);
  }
}

const childRows = await directus.request(
  readItems("child", {
    filter: { status: { _eq: "active" } },
    fields: ["id", "display_name", "status"],
    limit: -1,
  }),
);

const activeChildIds = childRows.map((c) => String(c.id));
const activeChildIdSet = new Set(activeChildIds);

console.log("\n=== TILE 2 source (active children) ===");
console.log(`count = ${childRows.length}\n`);
console.log("| # | child.id | display_name | child.status | in Tile 3 set? | should be in Tile 4 (waiting)? |");
console.log("|---|---|---|---|---|---|");
childRows.forEach((c, i) => {
  const cid = String(c.id);
  const inT3 = sponsoredChildIds.has(cid);
  console.log(
    `| ${i + 1} | ${cid} | ${c.display_name ?? "—"} | ${c.status} | ${inT3 ? "YES" : "no"} | ${inT3 ? "no" : "YES"} |`,
  );
});

console.log("\n=== TILE 3 source (sponsored child IDs from sponsorship rows) ===");
console.log(`distinct count = ${sponsoredChildIds.size}`);
console.log(`raw rows = ${sponsorshipRows.length}\n`);
console.log("| # | sponsored child.id | also in active children set? |");
console.log("|---|---|---|");
[...sponsoredChildIds].forEach((cid, i) => {
  const inActive = activeChildIdSet.has(cid);
  console.log(`| ${i + 1} | ${cid} | ${inActive ? "YES" : "NO ← gap" } |`);
});

console.log("\n=== TILE 4 calculation (current code: `active children NOT in sponsored set`) ===");
const waitingChildren = childRows.filter((c) => !sponsoredChildIds.has(String(c.id)));
console.log(`count = ${waitingChildren.length}`);
waitingChildren.forEach((c, i) => {
  console.log(`  ${i + 1}. ${String(c.id)} — ${c.display_name ?? "—"}`);
});

console.log("\n=== MATH IDENTITY CHECK ===");
const tile2 = childRows.length;
const tile3 = sponsoredChildIds.size;
const tile4 = waitingChildren.length;
console.log(`Tile 2 (listed)  = ${tile2}`);
console.log(`Tile 3 (sponsored) = ${tile3}`);
console.log(`Tile 4 (waiting) = ${tile4}`);
console.log(`Tile 2 - Tile 3 = ${tile2 - tile3} ${tile2 - tile3 === tile4 ? "✓ matches Tile 4" : `✗ Tile 4 disagrees by ${tile4 - (tile2 - tile3)}`}`);

const sponsoredButInactive = [...sponsoredChildIds].filter((cid) => !activeChildIdSet.has(cid));
if (sponsoredButInactive.length > 0) {
  console.log(`\nROOT CAUSE: ${sponsoredButInactive.length} child(ren) in Tile 3 but NOT in Tile 2:`);
  sponsoredButInactive.forEach((cid) => console.log(`  - ${cid}`));
  console.log("Tile 3 over-counts by including sponsored children whose child.status ≠ 'active'.");
  console.log("Math identity: Tile 2 - Tile 3 = " + (tile2 - tile3) + ", but Tile 4 = " + tile4 + " because the sponsored-but-inactive child(ren) are excluded from Tile 4's denominator.");
}
