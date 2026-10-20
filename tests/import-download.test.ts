import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { downloadToStorage, ImportError } from "@/lib/import/download";
import { defaultPolicy } from "@/lib/ssrf";

// Mock remote servers on loopback. The policy permits ONLY 127.0.0.1 and the test port; everything else
// (metadata IP, RFC1918 names, other loopback addresses) still goes through the real guard.
let server: http.Server;
let port: number;
const MB = 1024 * 1024;

const policy = () =>
  defaultPolicy({
    allowedPorts: [port],
    isAddressAllowed: (ip) => ip === "127.0.0.1",
    resolve: async (h) => {
      if (h === "good.test") return ["127.0.0.1"];
      if (h === "internal.test") return ["10.0.0.5"];
      throw new Error("NXDOMAIN");
    },
  });

const sink = () => {
  const r = { bytes: 0, type: "" };
  return {
    r,
    fn: async (stream: NodeJS.ReadableStream, contentType: string) => {
      r.type = contentType;
      for await (const c of stream) r.bytes += (c as Buffer).length;
    },
  };
};
const url = (p: string) => `http://good.test:${port}${p}`;
const run = (p: string, over: Record<string, unknown> = {}, s = sink()) =>
  downloadToStorage({ url: url(p), maxBytes: 5 * MB, policy: policy(), sink: s.fn, ...over }).then((res) => ({ res, s }));

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = req.url ?? "/";
    if (req.method === "HEAD" && (p === "/huge-chunked.mp4" || p === "/slow.mp4")) {
      res.writeHead(200, { "content-type": "video/mp4" });
      return res.end();
    }
    if (p === "/ok.mp4") {
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(1 * MB) });
      return res.end(Buffer.alloc(1 * MB, 1));
    }
    if (p === "/nohead.mp4") {
      if (req.method === "HEAD") {
        res.writeHead(405);
        return res.end();
      }
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": "1000" });
      return res.end(Buffer.alloc(1000));
    }
    if (p === "/page.html") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<html/>");
    }
    if (p === "/octet-noext") {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end("xx");
    }
    if (p === "/huge-declared.mp4") {
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(50 * MB) });
      return res.end(Buffer.alloc(10));
    }
    if (p === "/huge-chunked.mp4") {
      // no Content-Length: the limit must be enforced while streaming
      res.writeHead(200, { "content-type": "video/mp4" });
      const chunk = Buffer.alloc(256 * 1024);
      const t = setInterval(() => res.write(chunk), 1);
      res.on("close", () => clearInterval(t));
      return;
    }
    if (p === "/slow.mp4") {
      // trickles forever
      res.writeHead(200, { "content-type": "video/mp4" });
      const t = setInterval(() => res.write(Buffer.alloc(10)), 50);
      res.on("close", () => clearInterval(t));
      return;
    }
    if (p === "/redir-ok") {
      res.writeHead(302, { location: "/ok.mp4" });
      return res.end();
    }
    if (p.startsWith("/loop")) {
      res.writeHead(302, { location: `/loop${Number(p.slice(5) || 0) + 1}` });
      return res.end();
    }
    if (p === "/redir-metadata") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    if (p === "/redir-private-name") {
      res.writeHead(302, { location: `http://internal.test:${port}/ok.mp4` });
      return res.end();
    }
    if (p === "/redir-loopback-ip") {
      res.writeHead(302, { location: `http://127.0.0.2:${port}/ok.mp4` });
      return res.end();
    }
    if (p === "/redir-file") {
      res.writeHead(302, { location: "file:///etc/passwd" });
      return res.end();
    }
    if (p === "/404.mp4") {
      res.writeHead(404);
      return res.end();
    }
    if (p === "/500.mp4") {
      res.writeHead(503);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.closeAllConnections?.();
  server.close();
});

describe("URL import download", () => {
  it("streams a valid video", async () => {
    const { res, s } = await run("/ok.mp4");
    expect(res.bytes).toBe(MB);
    expect(s.r.bytes).toBe(MB);
    expect(s.r.type).toBe("video/mp4");
  });

  it("works when HEAD is rejected and type is octet-stream with a video extension", async () => {
    const { res } = await run("/nohead.mp4");
    expect(res.bytes).toBe(1000);
  });

  it("rejects non-video content types (no retry)", async () => {
    await expect(run("/page.html")).rejects.toMatchObject({ code: "not_video", retryable: false });
    await expect(run("/octet-noext")).rejects.toMatchObject({ code: "not_video" });
  });

  it("rejects an oversized file from Content-Length before downloading", async () => {
    await expect(run("/huge-declared.mp4")).rejects.toMatchObject({ code: "too_large", retryable: false });
  });

  it("aborts an oversized stream with no Content-Length", async () => {
    const s = sink();
    await expect(run("/huge-chunked.mp4", { maxBytes: 2 * MB }, s)).rejects.toMatchObject({ code: "too_large", retryable: false });
    expect(s.r.bytes).toBeLessThanOrEqual(2 * MB + 512 * 1024);
  });

  it("kills a stalled/slow download (minimum throughput)", async () => {
    await expect(run("/slow.mp4", { minBytesPerSec: 100_000, stallGraceMs: 200, stallCheckMs: 200 })).rejects.toMatchObject({
      code: "stalled",
      retryable: true,
    });
  });

  it("enforces the hard timeout", async () => {
    await expect(run("/slow.mp4", { hardTimeoutMs: 400, minBytesPerSec: 0 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("follows redirects", async () => {
    const { res } = await run("/redir-ok");
    expect(res.bytes).toBe(MB);
    expect(res.finalUrl).toContain("/ok.mp4");
  });

  it("stops after 3 redirects", async () => {
    await expect(run("/loop0")).rejects.toMatchObject({ code: "too_many_redirects" });
  });

  it("blocks redirects to internal targets (guard re-runs on every hop)", async () => {
    for (const p of ["/redir-metadata", "/redir-private-name", "/redir-loopback-ip", "/redir-file"]) {
      const err = await run(p).then(
        () => null,
        (e) => e,
      );
      expect(err, p).toBeInstanceOf(ImportError);
      expect(err.retryable, p).toBe(false);
    }
    await expect(run("/redir-metadata")).rejects.toMatchObject({ code: "blocked_address" });
    await expect(run("/redir-private-name")).rejects.toMatchObject({ code: "blocked_address" });
  });

  it("4xx is not retryable, 5xx is", async () => {
    await expect(run("/404.mp4")).rejects.toMatchObject({ code: "unreachable", retryable: false });
    await expect(run("/500.mp4")).rejects.toMatchObject({ code: "http_error", retryable: true });
  });

  it("refuses a hostname that resolves to a private address", async () => {
    await expect(
      downloadToStorage({ url: `http://internal.test:${port}/ok.mp4`, maxBytes: MB, policy: policy(), sink: sink().fn }),
    ).rejects.toMatchObject({ code: "blocked_address" });
  });
});
