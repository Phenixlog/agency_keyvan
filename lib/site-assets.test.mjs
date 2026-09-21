import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSiteAssets } from "./site-assets.ts";

const PAGE = "https://atelier-lune.fr/boutique/";

test("prend la plus grande icône, en préférant apple-touch-icon", () => {
  const html = `<head>
    <title>Atelier Lune — Céramique faite main</title>
    <link rel="icon" href="/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/32.png">
    <link rel='apple-touch-icon' sizes='180x180' href='/icons/apple.png'>
    <link rel="stylesheet" href="/style.css">
    <meta property="og:image" content="https://cdn.atelier-lune.fr/partage.jpg?w=1200&amp;h=630">
    <meta property="og:site_name" content="Atelier Lune">
  </head>`;
  assert.deepEqual(extractSiteAssets(html, PAGE), {
    logo: "https://atelier-lune.fr/icons/apple.png",
    image: "https://cdn.atelier-lune.fr/partage.jpg?w=1200&h=630",
    siteName: "Atelier Lune",
  });
});

test("résout les chemins relatifs et retombe sur le <title> pour le nom", () => {
  const html = `<title>Vélo Nantes | Vélos cargo pour la ville</title><link href=icon.svg rel="shortcut icon"><meta name="twitter:image" content="../img/carte.png">`;
  assert.deepEqual(extractSiteAssets(html, PAGE), {
    logo: "https://atelier-lune.fr/boutique/icon.svg",
    image: "https://atelier-lune.fr/img/carte.png",
    siteName: "Vélo Nantes",
  });
});

test("un SVG l'emporte sur un favicon sans taille", () => {
  const html = `<link rel="icon" href="/favicon.ico"><link rel="icon" href="/logo.svg" type="image/svg+xml">`;
  assert.equal(extractSiteAssets(html, PAGE).logo, "https://atelier-lune.fr/logo.svg");
});

test("refuse tout ce qui n'est pas une adresse http(s)", () => {
  const html = `<link rel="icon" href="data:image/png;base64,AAAA"><link rel="icon" href="javascript:alert(1)">
    <meta property="og:image" content="file:///etc/passwd"><meta property="og:image" content="ftp://x/y.png">`;
  assert.deepEqual(extractSiteAssets(html, PAGE), { logo: null, image: null, siteName: null });
});

test("une page vide ou illisible ne casse rien", () => {
  assert.deepEqual(extractSiteAssets("", PAGE), { logo: null, image: null, siteName: null });
  assert.deepEqual(extractSiteAssets("<link rel=icon href='/a.png'>", "pas une url"), { logo: null, image: null, siteName: null });
});
