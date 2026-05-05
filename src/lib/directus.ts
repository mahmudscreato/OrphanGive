import { createDirectus, rest } from "@directus/sdk";

const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;

if (!url) {
  throw new Error("NEXT_PUBLIC_DIRECTUS_URL is not defined");
}

export const directus = createDirectus(url).with(rest());
