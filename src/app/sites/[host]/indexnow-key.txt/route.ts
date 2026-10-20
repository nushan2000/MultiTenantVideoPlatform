import { indexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

// Served at /<INDEXNOW_KEY>.txt on every tenant host (middleware rewrites it here). Proves ownership to IndexNow engines.
export async function GET() {
  const key = indexNowKey();
  return key ? new Response(key, { headers: { "content-type": "text/plain; charset=utf-8" } }) : new Response("Not found", { status: 404 });
}
