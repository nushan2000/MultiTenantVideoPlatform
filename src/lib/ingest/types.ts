import { EntitlementError } from "../entitlements";
import { QuotaError } from "../quota";
import { RateLimitError } from "../rate-limit";
import { ZodError } from "zod";
import { SsrfError } from "../ssrf";

export type IngestContext = {
  tenantId: string;
  userId: string;
  planKey: string;
  ip: string;
};

/**
 * An ingest method gets bytes into `tenants/{tenantId}/videos/{videoId}/source.*` and then hands the video to the
 * shared processing path via `finalizeIngest()`. Add a third method (e.g. FTP, share-link resolver) by implementing
 * this interface and registering it in ./index.ts; nothing downstream changes.
 */
export interface IngestMethod<Input, Result> {
  readonly id: "DIRECT" | "URL";
  start(ctx: IngestContext, input: Input): Promise<Result>;
}

/** Optional hook: turn a share link (Google Drive, Dropbox...) into a direct download link. None implemented by design. */
export interface RemoteSourceResolver {
  matches(url: URL): boolean;
  resolve(url: URL): Promise<string>;
}
export const remoteSourceResolvers: RemoteSourceResolver[] = [];

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

/** Map any thrown error to {status, body} for route handlers. */
export function toHttpError(err: unknown): { status: number; body: { error: string; code?: string; retryAfter?: number; issues?: unknown } } {
  if (err instanceof HttpError) return { status: err.status, body: { error: err.message, code: err.code } };
  if (err instanceof ZodError) return { status: 400, body: { error: "Invalid input", code: "invalid", issues: err.issues.map((i) => ({ path: i.path, message: i.message })) } };
  if (err instanceof RateLimitError) return { status: 429, body: { error: err.message, code: "rate_limited", retryAfter: err.retryAfterSec } };
  if (err instanceof QuotaError) return { status: 413, body: { error: err.message, code: "quota_exceeded" } };
  if (err instanceof EntitlementError) return { status: 403, body: { error: err.message, code: err.code } };
  if (err instanceof SsrfError) return { status: 400, body: { error: err.message, code: err.code } };
  return { status: 500, body: { error: "Something went wrong", code: "internal" } };
}
