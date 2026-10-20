import { NextResponse } from "next/server";
import { getUser } from "@/lib/access";
import { platformDb } from "@/lib/db/client";
import { checkSlug } from "@/lib/tenancy/slugs";
import { rateLimit, clientIp, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/sites/slug-available?slug=acme
export async function GET(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    await rateLimit(`slug-check:${clientIp(req.headers)}`, 60, 60);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: "slow down" }, { status: 429 });
  }
  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim().toLowerCase();
  const check = checkSlug(slug);
  if (!check.ok) return NextResponse.json({ available: false, reason: check.reason });
  const taken = await platformDb.tenant.findUnique({ where: { slug }, select: { id: true } });
  return NextResponse.json({ available: !taken, reason: taken ? "taken" : undefined });
}
