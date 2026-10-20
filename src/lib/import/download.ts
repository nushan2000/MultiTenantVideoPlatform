import { Agent, request } from "undici";
import { PassThrough, Transform, pipeline, type Readable } from "node:stream";
import { guardedLookup, SsrfError, validateUrl, type SsrfPolicy } from "../ssrf";
import { isVideoExtension } from "../storage";

export type ImportErrorCode =
  | "unreachable" | "not_video" | "too_large" | "timeout" | "stalled" | "blocked_address" | "too_many_redirects" | "http_error";

/** `retryable` drives BullMQ backoff: only transient network/5xx failures retry. */
export class ImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type DownloadOptions = {
  url: string;
  maxBytes: number;
  policy: SsrfPolicy;
  /** Receives the (size-limited) byte stream. Must consume it fully, e.g. S3 multipart upload. */
  sink: (stream: Readable, contentType: string, signal: AbortSignal) => Promise<void>;
  onProgress?: (downloaded: number, total: number | null) => void;
  /** Called once headers are validated, before any bytes are stored (lets the caller shrink its quota reservation). */
  onHeaders?: (info: { contentLength: number | null; contentType: string }) => Promise<void> | void;
  hardTimeoutMs?: number; // default 30 min
  minBytesPerSec?: number; // default 16 KiB/s, measured over 10 s windows after a 30 s grace period
  maxRedirects?: number; // default 3
  headTimeoutMs?: number;
  stallGraceMs?: number; // default 30 s
  stallCheckMs?: number; // default 10 s
};

export type DownloadResult = { bytes: number; contentType: string; finalUrl: string };

const REDIRECT = new Set([301, 302, 303, 307, 308]);

/** Destroy a response body without leaving an unhandled 'error' event behind. */
const drop = (body: Readable) => {
  body.on("error", () => {});
  body.destroy();
};

function classifyNetworkError(err: unknown): ImportError {
  if (err instanceof ImportError) return err;
  if (err instanceof SsrfError) {
    return new ImportError(err.code === "dns_failed" ? "unreachable" : "blocked_address", err.message, err.code === "dns_failed");
  }
  const code = (err as any)?.code ?? (err as any)?.cause?.code;
  if (code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return new ImportError("timeout", "The remote server timed out", true);
  }
  if (err instanceof SsrfError || (err as any)?.cause instanceof SsrfError) {
    const e = ((err as any).cause ?? err) as SsrfError;
    return new ImportError("blocked_address", e.message, false);
  }
  return new ImportError("unreachable", "The remote server could not be reached", true);
}

function contentTypeOk(contentType: string, url: URL): boolean {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (ct.startsWith("video/")) return true;
  if (ct === "application/octet-stream" || ct === "binary/octet-stream") {
    const ext = /\.([a-z0-9]{2,5})$/i.exec(url.pathname)?.[1];
    return !!ext && isVideoExtension(ext);
  }
  return false;
}

export async function downloadToStorage(opts: DownloadOptions): Promise<DownloadResult> {
  const { policy, maxBytes } = opts;
  const maxRedirects = opts.maxRedirects ?? 3;
  const hardTimeoutMs = opts.hardTimeoutMs ?? 30 * 60_000;
  const minRate = opts.minBytesPerSec ?? 16 * 1024;

  // The agent's `lookup` re-runs the SSRF guard on EVERY connection (initial request and each redirect hop)
  // and connects to the address it validated.
  const agent = new Agent({
    connect: { lookup: guardedLookup(policy) as any, timeout: 15_000 },
    headersTimeout: opts.headTimeoutMs ?? 30_000,
    bodyTimeout: 60_000,
  });

  const controller = new AbortController();
  let abortReason: ImportError | null = null;
  const abortWith = (e: ImportError) => {
    abortReason ??= e;
    controller.abort();
  };
  const hardTimer = setTimeout(() => abortWith(new ImportError("timeout", "Download took too long", false)), hardTimeoutMs);

  /** Follow redirects manually: validate (syntax + port + host policy) on every hop. */
  async function open(method: "HEAD" | "GET", startUrl: string) {
    let current = startUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      let url: URL;
      try {
        url = validateUrl(current, policy);
      } catch (e) {
        throw classifyNetworkError(e);
      }
      let res;
      try {
        res = await request(url, {
          method,
          dispatcher: agent,
          signal: controller.signal,
          headers: { "user-agent": "VideoPlatformImporter/1.0", accept: "video/*,application/octet-stream;q=0.8,*/*;q=0.1" },
        });
      } catch (e) {
        throw abortReason ?? classifyNetworkError(e);
      }
      if (REDIRECT.has(res.statusCode)) {
        const loc = res.headers.location;
        drop(res.body);
        if (!loc || typeof loc !== "string") throw new ImportError("unreachable", "Bad redirect from remote server", false);
        current = new URL(loc, url).toString();
        continue;
      }
      return { res, url };
    }
    throw new ImportError("too_many_redirects", "Too many redirects", false);
  }

  const httpError = (status: number) =>
    status >= 500
      ? new ImportError("http_error", `The remote server returned an error (HTTP ${status})`, true)
      : new ImportError("unreachable", `The remote server refused the request (HTTP ${status})`, false);

  try {
    // ---- 1. HEAD (best effort: many servers reject it; the GET response is re-checked anyway) ----
    let total: number | null = null;
    try {
      const head = await open("HEAD", opts.url);
      drop(head.res.body);
      if (head.res.statusCode >= 200 && head.res.statusCode < 300) {
        const ct = String(head.res.headers["content-type"] ?? "");
        if (ct && !contentTypeOk(ct, head.url)) throw new ImportError("not_video", "The link does not point to a video file", false);
        const len = Number(head.res.headers["content-length"]);
        if (Number.isFinite(len) && len > maxBytes) throw new ImportError("too_large", "The file is larger than your plan allows", false);
      } // 4xx/5xx on HEAD (405/403/...): fall through, the GET response is authoritative
    } catch (e) {
      const fatal: ImportErrorCode[] = ["not_video", "too_large", "blocked_address", "too_many_redirects"];
      if (e instanceof ImportError && fatal.includes(e.code)) throw e;
      if (abortReason) throw abortReason;
      // otherwise: HEAD not usable, continue with GET
    }

    // ---- 2. GET ----
    const { res, url: finalUrl } = await open("GET", opts.url);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      drop(res.body);
      throw httpError(res.statusCode);
    }
    const contentType = String(res.headers["content-type"] ?? "application/octet-stream");
    if (!contentTypeOk(contentType, finalUrl)) {
      drop(res.body);
      throw new ImportError("not_video", "The link does not point to a video file", false);
    }
    const declared = Number(res.headers["content-length"]);
    total = Number.isFinite(declared) && declared > 0 ? declared : null;
    if (total !== null && total > maxBytes) {
      drop(res.body);
      throw new ImportError("too_large", "The file is larger than your plan allows", false);
    }
    await opts.onHeaders?.({ contentLength: total, contentType });

    // ---- 3. stream into storage, enforcing size + throughput while streaming ----
    let bytes = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length;
        if (bytes > maxBytes) return cb(new ImportError("too_large", "The file is larger than your plan allows", false));
        cb(null, chunk);
      },
    });

    let lastBytes = 0;
    const started = Date.now();
    const checkMs = opts.stallCheckMs ?? 10_000;
    const watchdog = setInterval(() => {
      opts.onProgress?.(bytes, total);
      if (Date.now() - started < (opts.stallGraceMs ?? 30_000)) return;
      if (bytes - lastBytes < minRate * (checkMs / 1000)) abortWith(new ImportError("stalled", "The download was too slow and was cancelled", true));
      lastBytes = bytes;
    }, checkMs);
    const progressTimer = setInterval(() => opts.onProgress?.(bytes, total), 1000);

    const out = new PassThrough();
    const piped = new Promise<void>((resolve, reject) => {
      pipeline(res.body, counter, out, (err) => (err ? reject(err) : resolve()));
    });
    controller.signal.addEventListener("abort", () => drop(res.body), { once: true });

    try {
      await Promise.all([piped, opts.sink(out, contentType, controller.signal)]);
    } catch (e) {
      throw abortReason ?? (e instanceof ImportError ? e : classifyNetworkError(e));
    } finally {
      clearInterval(watchdog);
      clearInterval(progressTimer);
    }
    if (bytes === 0) throw new ImportError("not_video", "The remote file is empty", false);
    if (total !== null && bytes < total) throw new ImportError("unreachable", "The connection closed before the file finished", true);
    opts.onProgress?.(bytes, total ?? bytes);
    return { bytes, contentType, finalUrl: finalUrl.toString() };
  } finally {
    clearTimeout(hardTimer);
    await agent.destroy().catch(() => {});
  }
}
