// Session 17 — list all readable fields on the `child` collection
// so we can pick a stable timestamp for "longest-waiting first".
import { createDirectus, rest, staticToken, readFieldsByCollection } from "@directus/sdk";

const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const token = process.env.DIRECTUS_SERVER_TOKEN;
if (!url || !token) {
  console.error("Missing env");
  process.exit(1);
}
const directus = createDirectus(url).with(staticToken(token)).with(rest());

const fields = await directus.request(readFieldsByCollection("child"));
const interesting = fields
  .map((f) => ({
    field: f.field,
    type: f.type,
    special: f.meta?.special?.join(",") ?? null,
  }))
  .sort((a, b) => a.field.localeCompare(b.field));
console.log("All fields on `child`:\n");
console.log("| field | type | special |");
console.log("|---|---|---|");
interesting.forEach((f) =>
  console.log(`| ${f.field} | ${f.type} | ${f.special ?? "—"} |`),
);

const dateLike = interesting.filter(
  (f) =>
    f.type === "dateTime" ||
    f.type === "timestamp" ||
    f.type === "date" ||
    /(_at|_date|date_)/.test(f.field),
);
console.log("\nDate-like fields:");
dateLike.forEach((f) => console.log(`  ${f.field} (${f.type})`));
