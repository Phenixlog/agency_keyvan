import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  BlockedUrlError,
  assertPublicUrl,
  guardedLookup,
  isBlockedAddress,
  safeFetchText,
} from "./safe-fetch.ts";

const BLOCKED_ADDRESSES = [
  "0.0.0.0",
  "10.1.2.3",
  "100.64.0.1",
  "127.0.0.1",
  "127.255.255.254",
  "169.254.169.254",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "255.255.255.255",
  "::",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:10.0.0.1",
  "64:ff9b::a00:1",
  "fc00::1",
  "fd12:3456::1",
  "fe80::1",
  "not-an-ip",
];

const PUBLIC_ADDRESSES = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"];

const BLOCKED_URLS = [
  "file:///etc/passwd",
  "ftp://example.com/",
  "gopher://example.com/",
  "http://localhost/",
  "http://LOCALHOST./",
  "http://app.localhost/",
  "http://127.0.0.1/",
  "http://2130706433/", // decimal form of 127.0.0.1
  "http://0x7f.0.0.1/", // hex form
  "http://017700000001/", // octal form
  "http://[::1]/",
  "http://[::ffff:127.0.0.1]/",
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.5/admin",
  "http://192.168.0.1/",
  "http://postgres/",
  "http://api.railway.internal/",
  "http://printer.local/",
  "http://example.com:8080/",
  "https://example.com:22/",
  "http://user:pass@example.com/",
  "not a url",
];

test("isBlockedAddress refuse les adresses non publiques", () => {
  for (const address of BLOCKED_ADDRESSES) {
    assert.equal(isBlockedAddress(address), true, address);
  }
});

test("isBlockedAddress accepte les adresses publiques", () => {
  for (const address of PUBLIC_ADDRESSES) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test("assertPublicUrl refuse les URL internes ou non http(s)", () => {
  for (const url of BLOCKED_URLS) {
    assert.throws(() => assertPublicUrl(url), BlockedUrlError, url);
  }
});

test("assertPublicUrl accepte une URL publique classique", () => {
  assert.equal(assertPublicUrl("https://example.com/a?b=1").hostname, "example.com");
  assert.equal(assertPublicUrl("http://8.8.8.8/").hostname, "8.8.8.8");
});

test("guardedLookup refuse un nom qui résout vers le loopback", async () => {
  const err = await new Promise((resolve) =>
    guardedLookup("localhost", {}, (e) => resolve(e))
  );
  assert.ok(err instanceof BlockedUrlError);
});

test("safeFetchText ne contacte jamais un serveur local", async () => {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.end("secret interne");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await assert.rejects(safeFetchText(`http://127.0.0.1:${port}/`), BlockedUrlError);
    await assert.rejects(safeFetchText("http://127.0.0.1/"), BlockedUrlError);
    await assert.rejects(safeFetchText("http://localhost/"), BlockedUrlError);
    assert.equal(hits, 0);
  } finally {
    server.close();
  }
});
