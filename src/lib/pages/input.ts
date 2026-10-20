import { z } from "zod";
import { handleSchema, pageSeoInputSchema, stripText } from "../seo";
import { RESERVED_PAGE_SLUGS } from "./system";

export const pageInputSchema = z.object({
  title: z.string().max(200).transform(stripText).pipe(z.string().min(1, "Give the page a title").max(100)),
  content: z.string().max(60_000).default(""),
  published: z.boolean().default(true),
  inFooter: z.boolean().default(true),
  seo: pageSeoInputSchema.omit({ handle: true }).default(() => pageSeoInputSchema.omit({ handle: true }).parse({})),
});

/** null = ok, otherwise a human message. */
export function pageSlugCheck(slug: string): string | null {
  const r = handleSchema.safeParse(slug);
  if (!r.success) return r.error.issues[0].message;
  if (RESERVED_PAGE_SLUGS.has(slug)) return "This URL is reserved by the site";
  return null;
}
