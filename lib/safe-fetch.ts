import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/**
 * SSRF-safe text fetcher for user-supplied URLs.
 *
 * The address check runs inside the socket's own DNS lookup, so the IP that is
 * validated is the IP that gets connected to (no DNS-rebinding window between
 * "check" and "fetch"). Redirects are followed manually and every hop goes
 * through the same validation.
 */

export class BlockedUrlError extends Error {
  constructor(reason: string) {
    super(`URL refusée: ${reason}`);
    this.name = "BlockedUrlError";
  }
}

const DEFAULT_TIMEOUT_MS = 5500;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml"];
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

const blockedAddresses = new BlockList();
const BLOCKED_SUBNETS: ReadonlyArray<[string, number, "ipv4" | "ipv6"]> = [
  ["0.0.0.0", 8, "ipv4"], // "this" network, 0.0.0.0
  ["10.0.0.0", 8, "ipv4"], // private
  ["100.64.0.0", 10, "ipv4"], // CGNAT
  ["127.0.0.0", 8, "ipv4"], // loopback
  ["169.254.0.0", 16, "ipv4"], // link-local, cloud metadata
  ["172.16.0.0", 12, "ipv4"], // private
  ["192.0.0.0", 24, "ipv4"], // IETF protocol assignments
  ["192.0.2.0", 24, "ipv4"], // TEST-NET-1
  ["192.168.0.0", 16, "ipv4"], // private
  ["198.18.0.0", 15, "ipv4"], // benchmarking
  ["198.51.100.0", 24, "ipv4"], // TEST-NET-2
  ["203.0.113.0", 24, "ipv4"], // TEST-NET-3
  ["224.0.0.0", 4, "ipv4"], // multicast
  ["240.0.0.0", 4, "ipv4"], // reserved, broadcast
  ["::", 128, "ipv6"], // unspecified
  ["::1", 128, "ipv6"], // loopback
  ["64:ff9b::", 96, "ipv6"], // NAT64, can embed a private IPv4
  ["2001:db8::", 32, "ipv6"], // documentation
  ["2002::", 16, "ipv6"], // 6to4, can embed a private IPv4
  ["fc00::", 7, "ipv6"], // unique local
  ["fe80::", 10, "ipv6"], // link-local
  ["ff00::", 8, "ipv6"], // multicast
];
for (const [network, prefix, family] of BLOCKED_SUBNETS) {
  blockedAddresses.addSubnet(network, prefix, family);
}

/** True when the IP is loopback, private, link-local, or otherwise non-public. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  // BlockList matches IPv4-mapped IPv6 (::ffff:a.b.c.d) against the IPv4 rules.
  return blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** Parses and validates a URL without touching the network. */
export function assertPublicUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("URL invalide");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("protocole non autorisé");
  }
  if (url.username || url.password) {
    throw new BlockedUrlError("identifiants dans l'URL");
  }
  if (url.port !== "") {
    throw new BlockedUrlError("port non standard");
  }

  // WHATWG URL already normalises exotic IPv4 forms (decimal, hex, octal).
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new BlockedUrlError("adresse non publique");
    return url;
  }
  if (!host.includes(".") || host === "localhost") {
    throw new BlockedUrlError("nom d'hôte interne");
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new BlockedUrlError("nom d'hôte interne");
  }
  return url;
}

/** DNS lookup that fails when any resolved address is non-public. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, result) => {
    if (err) return callback(err, "", 0);
    const addresses = result as LookupAddress[];
    if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
      return callback(new BlockedUrlError("adresse non publique"), "", 0);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
};

function requestOnce(
  url: URL,
  signal: AbortSignal,
  userAgent: string
): Promise<IncomingMessage> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        signal,
        headers: {
          "User-Agent": userAgent,
          Accept: ALLOWED_CONTENT_TYPES.join(", "),
          "Accept-Encoding": "identity",
        },
      },
      resolve
    );
    req.on("error", reject);
    req.end();
  });
}

function readBody(res: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (chunk: Buffer) => {
      const remaining = maxBytes - size;
      if (remaining <= 0) return;
      chunks.push(chunk.length > remaining ? chunk.subarray(0, remaining) : chunk);
      size += chunk.length;
      if (size >= maxBytes) res.destroy();
    });
    // An error (timeout, reset) rejects first; "close" then resolves as a no-op.
    res.on("error", reject);
    res.on("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

/**
 * Fetches a public http(s) URL and returns its body as text.
 * Throws BlockedUrlError when the URL (or any redirect hop) is not public.
 */
export async function safeFetchText(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const userAgent = options.userAgent ?? "OnboardingBot/1.0";
  const signal = AbortSignal.timeout(timeoutMs);

  let url = assertPublicUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await requestOnce(url, signal, userAgent);
    const status = res.statusCode ?? 0;

    if (status >= 300 && status < 400 && res.headers.location) {
      res.destroy();
      url = assertPublicUrl(new URL(res.headers.location, url).toString());
      continue;
    }
    if (status < 200 || status >= 300) {
      res.destroy();
      throw new Error(`Réponse HTTP ${status}`);
    }
    const contentType = (res.headers["content-type"] ?? "").toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
      res.destroy();
      throw new Error("Type de contenu non pris en charge");
    }
    return readBody(res, maxBytes);
  }
  throw new BlockedUrlError("trop de redirections");
}
