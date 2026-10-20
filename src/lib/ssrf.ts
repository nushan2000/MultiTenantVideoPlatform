import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";

/**
 * SSRF guard for URL imports. Three independent checks:
 *  1. `validateUrl`  - syntax/policy (scheme, port, credentials, own-domain block)
 *  2. `isPublicIp`   - the resolved address must be globally routable unicast
 *  3. `guardedLookup`- DNS is resolved HERE and the connection uses exactly the address we validated,
 *                      so a rebinding DNS server can't swap in a private IP between check and connect.
 * The WHATWG URL parser already normalises decimal/hex/octal IPv4 (http://2130706433, 0x7f.1, 0177.0.0.1)
 * and IPv4-mapped IPv6 into canonical form, so the IP check sees the real address.
 */

export class SsrfError extends Error {
  constructor(
    message: string,
    public readonly code: "bad_url" | "blocked_address" | "dns_failed" | "own_domain",
  ) {
    super(message);
  }
}

export type SsrfPolicy = {
  allowedPorts: number[];
  /** hostnames (exact) and suffixes (".platform.com") that may never be imported from */
  blockedHosts: string[];
  isAddressAllowed: (ip: string) => boolean;
  resolve: (hostname: string) => Promise<string[]>;
};

/** Anything that is not plain global unicast is refused: private, loopback, link-local, multicast, CGNAT, reserved, etc. */
export function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
  }
  const range = addr.range();
  if (range !== "unicast") return false;
  // extra explicit denials not covered by ipaddr's "unicast": cloud metadata + benchmarking/doc ranges
  if (addr.kind() === "ipv4") {
    const b = (addr as ipaddr.IPv4).octets;
    if (b[0] === 0) return false;
    if (b[0] === 192 && b[1] === 0 && b[2] === 0) return false; // 192.0.0.0/24 IETF
    if (b[0] === 198 && (b[1] === 18 || b[1] === 19)) return false; // benchmarking
    if (b[0] >= 240) return false;
  } else {
    const w = (addr as ipaddr.IPv6).parts;
    if (w[0] === 0x2001 && w[1] === 0x0db8) return false; // documentation
    if (w[0] === 0xfd00 && w[1] === 0x0ec2) return false; // AWS IPv6 metadata
  }
  return true;
}

export const defaultPolicy = (extra: Partial<SsrfPolicy> = {}): SsrfPolicy => ({
  allowedPorts: [80, 443],
  blockedHosts: [],
  isAddressAllowed: isPublicIp,
  resolve: async (hostname) => (await dns.lookup(hostname, { all: true, verbatim: true })).map((r) => r.address),
  ...extra,
});

function stripBrackets(h: string) {
  return h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
}

export function validateUrl(raw: string, policy: SsrfPolicy = defaultPolicy()): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("Not a valid URL", "bad_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SsrfError("Only http and https URLs are allowed", "bad_url");
  if (url.username || url.password) throw new SsrfError("URLs with credentials are not allowed", "bad_url");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!policy.allowedPorts.includes(port)) throw new SsrfError("Only ports 80 and 443 are allowed", "bad_url");

  const host = stripBrackets(url.hostname).toLowerCase().replace(/\.$/, "");
  if (!host) throw new SsrfError("Not a valid URL", "bad_url");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new SsrfError("That address is not allowed", "blocked_address");
  }
  for (const b of policy.blockedHosts) {
    const bl = b.toLowerCase();
    if (host === bl || host.endsWith(`.${bl}`)) throw new SsrfError("Importing from this platform's own domains is not allowed", "own_domain");
  }
  if (net.isIP(host) && !policy.isAddressAllowed(host)) throw new SsrfError("That address is not allowed", "blocked_address");
  return url;
}

/** Resolve and verify; every returned address is guaranteed allowed. */
export async function resolveSafe(hostname: string, policy: SsrfPolicy = defaultPolicy()): Promise<string[]> {
  const host = stripBrackets(hostname);
  let addrs: string[];
  if (net.isIP(host)) addrs = [host];
  else {
    try {
      addrs = await policy.resolve(host);
    } catch {
      throw new SsrfError("Could not resolve host", "dns_failed");
    }
  }
  if (addrs.length === 0) throw new SsrfError("Could not resolve host", "dns_failed");
  // ALL records must be public: refusing mixed answers blocks "public + private" rebinding tricks.
  if (!addrs.every((a) => policy.isAddressAllowed(a))) throw new SsrfError("That address is not allowed", "blocked_address");
  return addrs;
}

/** `lookup` function for undici/net: resolves + validates, then hands the socket the validated IP. */
export function guardedLookup(policy: SsrfPolicy = defaultPolicy()) {
  return (
    hostname: string,
    options: { all?: boolean } | undefined,
    cb: (err: Error | null, address?: any, family?: number) => void,
  ) => {
    resolveSafe(hostname, policy).then(
      (addrs) => {
        const out = addrs.map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 }));
        if (options?.all) cb(null, out);
        else cb(null, out[0].address, out[0].family);
      },
      (err) => cb(err),
    );
  };
}
