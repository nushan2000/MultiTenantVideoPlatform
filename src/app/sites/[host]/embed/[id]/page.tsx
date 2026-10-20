import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HlsPlayer from "@/components/HlsPlayer";
import { tenantDb } from "@/lib/db/client";
import { adsForTenant, mediaUrl } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";

export const dynamic = "force-dynamic";

// The embeddable player. It is the video sitemap's <video:player_loc>; it must never be indexed as a page itself.
export const metadata: Metadata = { title: "Player", robots: { index: false, follow: false } };

export default async function Embed({ params }: { params: Promise<{ host: string; id: string }> }) {
  const { host, id } = await params;
  const tenant = await tenantForHost(host);
  if (!tenant) notFound();
  const video = await tenantDb(tenant.id).video.findFirst({ where: { id, status: "READY", visibility: { in: ["PUBLIC", "UNLISTED"] } } });
  if (!video) notFound();
  if (await ageGateBlocks(tenant)) notFound(); // consent cookie is host-scoped; embeds on other sites must not bypass the gate
  const ads = await adsForTenant(tenant);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <style>{"body{margin:0;background:#000}video{width:100%;height:100%;display:block;background:#000}"}</style>
      <HlsPlayer src={mediaUrl(video.hlsPath)!} poster={mediaUrl(video.thumbnailPath)} videoId={video.id} vastTagUrl={ads.vastTagUrl} />
    </div>
  );
}
