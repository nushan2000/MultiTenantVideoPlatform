import { NextResponse } from "next/server";
import { assertSameOrigin } from "./access";
import { toHttpError } from "./ingest/types";
import { logger } from "./logger";

type Handler<C> = (req: Request, ctx: C) => Promise<Response | object>;

/** Wraps a route handler: CSRF origin check on mutations, uniform JSON errors, logging of unexpected failures. */
export function route<C = { params: Promise<Record<string, string>> }>(handler: Handler<C>, opts: { csrf?: boolean } = {}) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      if (opts.csrf !== false) assertSameOrigin(req);
      const out = await handler(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out, { headers: { "cache-control": "no-store" } });
    } catch (err) {
      const { status, body } = toHttpError(err);
      if (status >= 500) logger.error({ err: err instanceof Error ? err.stack : String(err), url: req.url }, "unhandled route error");
      const headers: Record<string, string> = {};
      if (status === 429 && body.retryAfter) headers["retry-after"] = String(body.retryAfter);
      return NextResponse.json(body, { status, headers });
    }
  };
}

/** BigInt-safe JSON for video rows. */
export const serializeVideo = <T extends { sizeBytes?: bigint | null }>(v: T) => ({
  ...v,
  sizeBytes: v.sizeBytes == null ? null : Number(v.sizeBytes),
});
