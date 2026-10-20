import { HttpError } from "./ingest/types";
import { keys, putObject } from "./storage";

const IMAGE_TYPES: Record<string, { ext: string; magic: number[] }> = {
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/webp": { ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] },
};

/** Validates by magic bytes (not the client's content-type); SVG is refused (script-capable). */
export async function storeBranding(tenantId: string, file: File, name: "logo" | "favicon" | "og"): Promise<string> {
  if (file.size > 1024 * 1024) throw new HttpError(400, "Images can be at most 1 MB");
  const kind = IMAGE_TYPES[file.type];
  const buf = Buffer.from(await file.arrayBuffer());
  if (!kind || !kind.magic.every((b, i) => buf[i] === b)) throw new HttpError(400, "Use a PNG, JPEG or WebP image");
  const key = keys.branding(tenantId, `${name}-${Date.now()}.${kind.ext}`);
  await putObject(key, buf, file.type, "public, max-age=31536000, immutable");
  return `/api/media/${key}`;
}

