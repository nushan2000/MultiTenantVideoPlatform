import { describe, expect, it } from "vitest";
import { defaultPolicy, guardedLookup, isPublicIp, resolveSafe, SsrfError, validateUrl } from "@/lib/ssrf";

const policy = defaultPolicy({ blockedHosts: ["platform.com", "localhost:9100".split(":")[0]] });

describe("validateUrl: malicious URLs are rejected", () => {
  const bad: [string, string][] = [
    ["localhost", "http://localhost/v.mp4"],
    ["localhost subdomain", "http://foo.localhost/v.mp4"],
    ["loopback", "http://127.0.0.1/v.mp4"],
    ["loopback short form", "http://127.1/v.mp4"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["decimal IP", "http://2130706433/v.mp4"],
    ["hex IP", "http://0x7f000001/v.mp4"],
    ["octal IP", "http://0177.0.0.1/v.mp4"],
    ["mixed hex dotted", "http://0x7f.0.0.1/v.mp4"],
    ["decimal metadata", "http://2852039166/"],
    ["IPv6 loopback", "http://[::1]/v.mp4"],
    ["IPv6-mapped loopback", "http://[::ffff:127.0.0.1]/v.mp4"],
    ["IPv6-mapped hex form", "http://[::ffff:7f00:1]/v.mp4"],
    ["IPv6-mapped metadata", "http://[::ffff:169.254.169.254]/"],
    ["IPv6 unique local", "http://[fd00::1]/v.mp4"],
    ["IPv6 link-local", "http://[fe80::1]/v.mp4"],
    ["AWS IPv6 metadata", "http://[fd00:ec2::254]/"],
    ["10/8", "http://10.1.2.3/v.mp4"],
    ["172.16/12", "http://172.16.5.5/v.mp4"],
    ["192.168/16", "http://192.168.0.10/v.mp4"],
    ["CGNAT", "http://100.64.0.1/v.mp4"],
    ["unspecified", "http://0.0.0.0/v.mp4"],
    ["multicast", "http://224.0.0.1/v.mp4"],
    ["file scheme", "file:///etc/passwd"],
    ["ftp scheme", "ftp://example.com/v.mp4"],
    ["gopher", "gopher://example.com/"],
    ["credentials", "http://user:pass@example.com/v.mp4"],
    ["port 22", "http://example.com:22/v.mp4"],
    ["port 8080", "https://example.com:8080/v.mp4"],
    ["own domain", "https://platform.com/v.mp4"],
    ["own subdomain", "https://acme.platform.com/v.mp4"],
    ["garbage", "not a url"],
  ];
  it.each(bad)("%s", (_name, url) => {
    expect(() => validateUrl(url, policy)).toThrow(SsrfError);
  });

  it("accepts ordinary public direct links", () => {
    expect(validateUrl("https://example.com/path/video.mp4?x=1", policy).hostname).toBe("example.com");
    expect(validateUrl("http://93.184.216.34/v.mp4", policy).hostname).toBe("93.184.216.34");
    expect(validateUrl("https://example.com:443/v.mp4", policy)).toBeTruthy();
  });

  it("does not mistake look-alike domains for own domain", () => {
    expect(() => validateUrl("https://notplatform.com/v.mp4", policy)).not.toThrow();
    expect(() => validateUrl("https://platform.com.evil.io/v.mp4", policy)).not.toThrow();
  });
});

describe("DNS resolution is checked (rebinding / private-resolving names)", () => {
  const withDns = (map: Record<string, string[]>) =>
    defaultPolicy({ resolve: async (h) => map[h] ?? Promise.reject(new Error("NXDOMAIN")) });

  it("rejects a public-looking name that resolves to a private IP", async () => {
    const p = withDns({ "evil.example": ["10.0.0.5"] });
    await expect(resolveSafe("evil.example", p)).rejects.toMatchObject({ code: "blocked_address" });
  });
  it("rejects names resolving to metadata / loopback / IPv6-mapped", async () => {
    for (const ip of ["169.254.169.254", "127.0.0.1", "::1", "::ffff:10.0.0.1"]) {
      await expect(resolveSafe("x.example", withDns({ "x.example": [ip] }))).rejects.toBeInstanceOf(SsrfError);
    }
  });
  it("rejects mixed public+private answers", async () => {
    const p = withDns({ "mix.example": ["93.184.216.34", "192.168.1.1"] });
    await expect(resolveSafe("mix.example", p)).rejects.toMatchObject({ code: "blocked_address" });
  });
  it("accepts public answers and unresolvable names fail closed", async () => {
    const p = withDns({ "ok.example": ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"] });
    await expect(resolveSafe("ok.example", p)).resolves.toHaveLength(2);
    await expect(resolveSafe("nx.example", p)).rejects.toMatchObject({ code: "dns_failed" });
  });
  it("guardedLookup hands back only validated addresses (connect-to-resolved-IP)", async () => {
    const p = withDns({ "ok.example": ["93.184.216.34"], "bad.example": ["10.0.0.1"] });
    const lookup = guardedLookup(p);
    const good = await new Promise<any>((res, rej) => lookup("ok.example", {}, (e, a) => (e ? rej(e) : res(a))));
    expect(good).toBe("93.184.216.34");
    await expect(new Promise((res, rej) => lookup("bad.example", {}, (e, a) => (e ? rej(e) : res(a))))).rejects.toBeInstanceOf(SsrfError);
  });
});

describe("isPublicIp", () => {
  it("accepts public v4/v6", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("2001:4860:4860::8888")).toBe(true);
  });
  it("rejects non-public and junk", () => {
    for (const ip of ["127.0.0.1", "::", "::1", "255.255.255.255", "198.18.0.1", "2001:db8::1", "nope", ""]) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });
});
