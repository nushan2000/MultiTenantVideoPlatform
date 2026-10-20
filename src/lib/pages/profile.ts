import { z } from "zod";
import { stripText } from "../seo";

const text = (max: number) => z.string().max(max * 2).transform(stripText).pipe(z.string().max(max));
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), s.optional());

/** Business details the generated legal pages are built from. All optional: pages degrade gracefully when empty. */
export const profileSchema = z.object({
  legalName: opt(text(120)),
  contactEmail: opt(z.string().trim().toLowerCase().email("Enter a valid email").max(200)),
  contactAddress: opt(text(300)),
  country: opt(text(80)),
  responseTime: opt(text(60)),
  // DMCA designated agent (US 17 U.S.C. 512(c)(2))
  dmcaAgentName: opt(text(120)),
  dmcaAgentEmail: opt(z.string().trim().toLowerCase().email("Enter a valid email").max(200)),
  dmcaAgentAddress: opt(text(300)),
  // 18 U.S.C. 2257 records custodian (adult sites)
  custodianName: opt(text(120)),
  custodianAddress: opt(text(300)),
});
export type Profile = z.infer<typeof profileSchema>;

export function parseProfile(v: unknown): Profile {
  const r = profileSchema.safeParse(v && typeof v === "object" ? v : {});
  return r.success ? r.data : profileSchema.parse({});
}
