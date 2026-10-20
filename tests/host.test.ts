import { describe, expect, it } from "vitest";
import { classifyHost, normalizeHost } from "@/lib/tenancy/host";
import { checkSlug } from "@/lib/tenancy/slugs";

describe("classifyHost", () => {
  const root = "platform.com";
  it("platform hosts", () => {
    for (const h of ["platform.com", "app.platform.com", "www.platform.com", "PLATFORM.com:3000"]) {
      expect(classifyHost(h, root)).toEqual({ kind: "platform" });
    }
  });
  it("tenant subdomains", () => {
    expect(classifyHost("acme.platform.com", root)).toEqual({ kind: "subdomain", slug: "acme" });
    expect(classifyHost("Acme.Platform.com:8080", root)).toEqual({ kind: "subdomain", slug: "acme" });
  });
  it("reserved and malformed platform subdomains are invalid", () => {
    for (const h of ["admin.platform.com", "api.platform.com", "a.b.platform.com", "-x.platform.com", "ab.platform.com"]) {
      expect(classifyHost(h, root)).toEqual({ kind: "invalid" });
    }
  });
  it("anything else is a custom-domain candidate", () => {
    expect(classifyHost("videos.example.com", root)).toEqual({ kind: "custom", hostname: "videos.example.com" });
    expect(classifyHost("evilplatform.com", root)).toEqual({ kind: "custom", hostname: "evilplatform.com" });
    expect(classifyHost("platform.com.evil.io", root)).toEqual({ kind: "custom", hostname: "platform.com.evil.io" });
  });
  it("works with localhost in dev", () => {
    expect(classifyHost("localhost:3000", "localhost")).toEqual({ kind: "platform" });
    expect(classifyHost("acme.localhost:3000", "localhost")).toEqual({ kind: "subdomain", slug: "acme" });
  });
  it("empty host is invalid", () => {
    expect(classifyHost("", root)).toEqual({ kind: "invalid" });
    expect(normalizeHost(undefined)).toBe("");
  });
});

describe("checkSlug", () => {
  it("accepts valid slugs", () => {
    for (const s of ["abc", "my-video-site", "a1b2c3"]) expect(checkSlug(s)).toEqual({ ok: true });
  });
  it("rejects bad format", () => {
    for (const s of ["ab", "-abc", "abc-", "ABC", "a_b", "a b", "a--b", "x".repeat(31), "xn--foo"]) {
      expect(checkSlug(s)).toEqual({ ok: false, reason: "format" });
    }
  });
  it("rejects reserved", () => {
    for (const s of ["www", "app", "api", "admin", "mail"]) expect(checkSlug(s).ok).toBe(false);
    expect(checkSlug("admin")).toEqual({ ok: false, reason: "reserved" });
  });
});
