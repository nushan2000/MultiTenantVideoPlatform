import { Readable } from "node:stream";
import { getUser, loadTenantAccess } from "@/lib/access";
import { addBandwidth, bandwidthUsed } from "@/lib/bandwidth";
import { entitlements } from "@/lib/entitlements";
import { mediaAccess } from "@/lib/media-cache";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Serves objects from storage with the access rules the storage layer itself doesn't know about:
 *   tenants/{t}/branding/*                      public
 *   tenants/{t}/videos/{v}/hls/* , thumb.jpg    READY videos only; PUBLIC/UNLISTED for everyone, PRIVATE for tenant members
 *   tenants/{t}/videos/{v}/source.*             never served
 * (Behind a CDN, serve the same paths from the CDN and keep this route as the origin.)
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.length < 3 || path[0] !== "tenants" || path.some((s) => s === ".." || s === "." || s.includes("\\"))) return notFound();
  const [, tenantId, kind, ...rest] = path;
  const key = path.join("/");
  let cache = "public, max-age=3600";
  let meterTenant: string | null = null;

  if (kind === "branding") {
    if (rest.length !== 1) return notFound();
  } else if (kind === "videos") {
    const [videoId, area, ...file] = rest;
    const isHls = area === "hls" && file.length >= 1;
    const isThumb = (area === "thumb.jpg" || area === "thumb-lg.jpg") && file.length === 0;
    const isCaption = area === "captions" && file.length === 1 && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?\.vtt$/.test(file[0]);
    if (!videoId || !(isHls || isThumb || isCaption)) return notFound();

    const video = await mediaAccess(tenantId, videoId);
    if (!video || video.status !== "READY" || video.tenantStatus !== "ACTIVE") return notFound();
    meterTenant = tenantId;
    // Monthly bandwidth allowance: playlists and segments stop when it is used up (thumbnails and captions keep working so the site still renders).
    if (isHls && (await bandwidthUsed(tenantId)) >= entitlements(video.planKey).bandwidthLimitBytes) {
      return new Response("This site has reached its monthly bandwidth limit. Playback resumes next month.", { status: 429, headers: { "retry-after": "3600", "cache-control": "no-store" } });
    }
    if (video.visibility === "PRIVATE") {
      const user = await getUser();
      const access = user && (await loadTenantAccess(user.id, { id: tenantId }));
      if (!access) return notFound();
      cache = "private, no-store";
    }
  } else {
    return notFound();
  }

  const range = req.headers.get("range") ?? undefined;
  try {
    // Videos processed before the large poster existed: fall back to the 640px thumbnail instead of a 404 (broken og:image).
    let obj;
    try {
      obj = await getObject(key, range);
    } catch (e: any) {
      if (key.endsWith("/thumb-lg.jpg") && (e?.$metadata?.httpStatusCode === 404 || e?.name === "NoSuchKey")) obj = await getObject(key.replace("thumb-lg.jpg", "thumb.jpg"), range);
      else throw e;
    }
    const headers = new Headers({
      "content-type": obj.ContentType ?? "application/octet-stream",
      "cache-control": key.endsWith(".m3u8") && cache.startsWith("public") ? "public, max-age=30" : cache,
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
      ...(key.includes("/hls/") ? { "x-robots-tag": "noindex, nofollow" } : {}),
    });
    if (obj.ContentLength != null) {
      headers.set("content-length", String(obj.ContentLength));
      if (meterTenant) void addBandwidth(meterTenant, obj.ContentLength);
    }
    if (obj.ContentRange) headers.set("content-range", obj.ContentRange);
    return new Response(Readable.toWeb(obj.Body as Readable) as ReadableStream, { status: range ? 206 : 200, headers });
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NoSuchKey") return notFound();
    throw e;
  }
}
