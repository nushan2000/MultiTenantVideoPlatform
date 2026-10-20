import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
import { getEnv } from "./env";

let client: S3Client | undefined;
let publicClient: S3Client | undefined;

function makeClient(endpoint: string | undefined): S3Client {
  const env = getEnv();
  return new S3Client({
    region: env.S3_REGION,
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    // Keep checksum headers off: S3-compatible stores (MinIO, s3rver) don't all accept the newer defaults.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** Server-side client: talks to storage over the VPS-internal endpoint (e.g. http://127.0.0.1:9000). */
export function s3(): S3Client {
  return (client ??= makeClient(getEnv().S3_ENDPOINT));
}

/**
 * Used ONLY to sign URLs that browsers will call (direct multipart upload). The signature covers the Host header,
 * so it must be signed for the public hostname (e.g. https://s3.example.com proxied to MinIO on this VPS).
 */
function s3Public(): S3Client {
  const env = getEnv();
  return (publicClient ??= makeClient(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT));
}

const Bucket = () => getEnv().S3_BUCKET;

// ---- object keys: everything lives under tenants/{tenantId}/ ----
export const keys = {
  videoPrefix: (tenantId: string, videoId: string) => `tenants/${tenantId}/videos/${videoId}/`,
  source: (tenantId: string, videoId: string, ext: string) => `tenants/${tenantId}/videos/${videoId}/source.${ext}`,
  hls: (tenantId: string, videoId: string, rel: string) => `tenants/${tenantId}/videos/${videoId}/hls/${rel}`,
  thumb: (tenantId: string, videoId: string) => `tenants/${tenantId}/videos/${videoId}/thumb.jpg`,
  /** 1280px poster: social previews (og:image), video rich results and the player poster. thumb.jpg (640px) is for grid cards. */
  thumbLarge: (tenantId: string, videoId: string) => `tenants/${tenantId}/videos/${videoId}/thumb-lg.jpg`,
  caption: (tenantId: string, videoId: string, lang: string) => `tenants/${tenantId}/videos/${videoId}/captions/${lang}.vtt`,
  branding: (tenantId: string, name: string) => `tenants/${tenantId}/branding/${name}`,
  tenantPrefix: (tenantId: string) => `tenants/${tenantId}/`,
};

export const PART_SIZE = 8 * 1024 * 1024; // S3 minimum is 5 MiB; 10,000 parts => 80 GB max

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const r = await s3().send(new CreateMultipartUploadCommand({ Bucket: Bucket(), Key: key, ContentType: contentType }));
  if (!r.UploadId) throw new Error("no UploadId");
  return r.UploadId;
}

export function presignPart(key: string, uploadId: string, partNumber: number, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3Public(), new UploadPartCommand({ Bucket: Bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn });
}

/** Server-internal presigned GET (e.g. handing the source to ffmpeg). Not for browsers. */
export function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: Bucket(), Key: key }), { expiresIn });
}

export async function listParts(key: string, uploadId: string): Promise<{ PartNumber: number; ETag: string; Size: number }[]> {
  const out: { PartNumber: number; ETag: string; Size: number }[] = [];
  let marker: string | undefined;
  for (;;) {
    const r = await s3().send(new ListPartsCommand({ Bucket: Bucket(), Key: key, UploadId: uploadId, PartNumberMarker: marker }));
    for (const p of r.Parts ?? []) out.push({ PartNumber: p.PartNumber!, ETag: p.ETag!, Size: p.Size ?? 0 });
    if (!r.IsTruncated) return out;
    marker = String(r.NextPartNumberMarker);
  }
}

export async function completeMultipart(key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
  const sorted = [...parts].sort((a, b) => a.PartNumber! - b.PartNumber!);
  await s3().send(
    new CompleteMultipartUploadCommand({ Bucket: Bucket(), Key: key, UploadId: uploadId, MultipartUpload: { Parts: sorted } }),
  );
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await s3().send(new AbortMultipartUploadCommand({ Bucket: Bucket(), Key: key, UploadId: uploadId })).catch(() => {});
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: Bucket(), Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType };
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound" || e?.name === "NoSuchKey") return null;
    throw e;
  }
}

export async function getObject(key: string, range?: string) {
  return s3().send(new GetObjectCommand({ Bucket: Bucket(), Key: key, Range: range }));
}

export async function putObject(key: string, body: Buffer | string | Readable, contentType: string, cacheControl?: string) {
  await s3().send(new PutObjectCommand({ Bucket: Bucket(), Key: key, Body: body as any, ContentType: contentType, CacheControl: cacheControl }));
}

/** Stream of unknown length -> object storage via multipart, bounded memory (queueSize * partSize). */
export async function uploadStream(key: string, body: Readable, contentType: string, signal?: AbortSignal): Promise<void> {
  const up = new Upload({
    client: s3(),
    params: { Bucket: Bucket(), Key: key, Body: body, ContentType: contentType },
    partSize: PART_SIZE,
    queueSize: 2,
    leavePartsOnError: false,
  });
  const onAbort = () => void up.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await up.done();
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function deletePrefix(prefix: string): Promise<void> {
  let token: string | undefined;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix: prefix, ContinuationToken: token }));
    const objs = (r.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (objs.length) await s3().send(new DeleteObjectsCommand({ Bucket: Bucket(), Delete: { Objects: objs } }));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
}

const VIDEO_EXT = new Set(["mp4", "mov", "webm", "mkv", "m4v", "avi", "mpg", "mpeg", "ts", "flv", "wmv", "ogv"]);
export const isVideoExtension = (ext: string) => VIDEO_EXT.has(ext.toLowerCase());
export function extOf(name: string): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name.split("?")[0]);
  return m && isVideoExtension(m[1]) ? m[1].toLowerCase() : "mp4";
}

/** First object under a prefix (used to find `source.<ext>` without storing the extension). */
export async function findObjectByPrefix(prefix: string): Promise<{ key: string; size: number } | null> {
  const r = await s3().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix: prefix, MaxKeys: 1 }));
  const o = r.Contents?.[0];
  return o?.Key ? { key: o.Key, size: o.Size ?? 0 } : null;
}
