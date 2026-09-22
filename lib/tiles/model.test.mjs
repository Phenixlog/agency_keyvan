import assert from "node:assert/strict";
import { test } from "node:test";
import { TILE_COPY_SCHEMA, TILE_KINDS, compareTexts, fallbackTilePlan, parseTilePlan, surfaceOf, tileCopyUserMessage, tilePrompt } from "./model.ts";

const GRAPHIC = { backgrounds: { brand: "warm brown #A9702C", light: "cream #F3E8D8", dark: "deep brown #3B2314" }, fonts: { display: "Archivo Black", body: "Inter" }, shape: "a soft rounded arc", stickers: "cream pills with thin outline", titles: "bold uppercase, tight leading", logoRule: "small, in a corner" };
const OS = { name: "Ferrand", positioning: "Boulangerie de quartier", audience: "", promise: "", tone: [], pillars: [], visual: { palette: ["brun #A9702C", "crème #F3E8D8"], style: "photo naturelle", mood: "", avoid: ["fond noir"] } };

test("parseTilePlan retire les guillemets et borne, refuse un plan sans titre", () => {
  const plan = parseTilePlan({ headline: ' Le "levain" du samedi ', subline: "x".repeat(300), cta: "Commander", scene: "a loaf", logoPlacement: "middle" });
  assert.equal(plan.headline, "Le levain du samedi");
  assert.equal(plan.subline.length, 120);
  assert.equal(plan.logoPlacement, "top-left");
  assert.equal(parseTilePlan({ headline: "" }), null);
  assert.equal(fallbackTilePlan("").headline, "Nouveauté");
});

test("le prompt cite chaque texte entre guillemets et interdit tout autre texte", () => {
  const plan = { headline: "Le levain du samedi", subline: "Cuit à 6h", caption: "", cta: "Commander", scene: "a sourdough loaf cut-out", logoPlacement: "bottom-right" };
  const prompt = tilePrompt({ plan, kind: "hook_photo", background: "brand", graphic: GRAPHIC, os: OS, aspectRatio: "4:5", hasLogo: true, brandName: "Ferrand" });
  for (const expected of ['"Le levain du samedi"', '"Cuit à 6h"', '"Commander"', "warm brown #A9702C", "bottom-right corner", "Archivo Black", "no other readable text", "Avoid: fond noir"]) {
    assert.ok(prompt.includes(expected), expected);
  }
  assert.doesNotMatch(prompt, /Small caption line/);
  const noLogo = tilePrompt({ plan, kind: "quote", background: "dark", graphic: GRAPHIC, os: null, aspectRatio: "1:1", hasLogo: false, brandName: "X" });
  assert.match(noLogo, /No logo, no watermark/);
  assert.match(noLogo, /texts in light colour/);
});

test("compareTexts tolère casse, accents et ponctuation, signale ce qui manque", () => {
  const plan = { headline: "Le levain du samedi", subline: "Cuit à 6h, chaud jusqu’à 10h", caption: "", cta: "" };
  assert.equal(compareTexts(plan, ["LE LEVAIN DU SAMEDI", "Cuit a 6h chaud jusqu'a 10h"]).ok, true);
  // Drawn on several lines with the logo between: read back as separate blocks, still conforming.
  assert.equal(compareTexts(plan, ["Le levain", "FERRAND", "du samedi", "Cuit à 6h, chaud jusqu’à 10h"]).ok, true);
  const bad = compareTexts(plan, ["LE LEVIAN DU SAMEDI", "Cuit à 6h, chaud jusqu’à 10h"]);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.issues, ["Le levain du samedi"]);
});

test("un support imprimé ou une signalétique ne reçoit ni bouton ni curseur, et le logo suit la surface", () => {
  const plan = { headline: "Vos transferts prêts en 6h", subline: "", caption: "", cta: "Entrez, on imprime en 30 min", scene: "a heat press", logoPlacement: "top-right" };
  const base = { plan, kind: "cta", background: "brand", graphic: GRAPHIC, os: OS, aspectRatio: "3:4", hasLogo: true, brandName: "PMT" };
  const screen = tilePrompt({ ...base, medium: { label: "Post portrait", surface: "screen" } });
  assert.match(screen, /Social media post design/);
  assert.match(screen, /button-like pill with the text: "Entrez, on imprime en 30 min"/);
  const print = tilePrompt({ ...base, medium: { label: "Flyer", surface: "print" } });
  assert.match(print, /Print-ready flat design of a Flyer, 3:4/);
  assert.match(print, /no mock-up/);
  assert.match(print, /no buttons, no mouse pointer/);
  assert.match(print, /plain text or a simple outlined label[^"]*"Entrez, on imprime en 30 min"/);
  assert.doesNotMatch(print, /button-like/);
  const sign = tilePrompt({ ...base, medium: { label: "Vitrophanie / vitrine", surface: "signage" } });
  assert.match(sign, /shown as the finished sign in its real setting/);
  assert.match(sign, /very large type/);
  assert.doesNotMatch(sign, /button-like/);
  // Without a medium, a tile is a social post (feeds and carousels).
  assert.match(tilePrompt(base), /Social media post design/);
  assert.equal(surfaceOf({ family: "signage", kind: "print" }), "signage");
  assert.equal(surfaceOf({ family: "print", kind: "print", nature: "artwork" }), "print");
  assert.equal(surfaceOf({ family: "textile", kind: "social_post", nature: "mockup" }), "print");
  assert.equal(surfaceOf({ family: "social", kind: "social_post" }), "screen");
  assert.equal(surfaceOf({ family: "deck", kind: "social_post" }), "screen");
  assert.match(tileCopyUserMessage({ os: null, summary: "", kind: "cta", brief: "x", formatLabel: "Flyer", surface: "print" }), /Flyer \(objet imprimé/);
});

test("catalogue et schéma", () => {
  assert.equal(Object.keys(TILE_KINDS).length, 10);
  assert.equal(TILE_COPY_SCHEMA.additionalProperties, false);
  assert.deepEqual(TILE_COPY_SCHEMA.properties.logoPlacement.enum, ["top-left", "top-right", "bottom-left", "bottom-right", "bottom-center"]);
});

import { CAROUSEL_PLAN_SCHEMA, FEED_PLAN_SCHEMA, carouselSlideKind, enforceCheckerboard, parseCarouselPlan, parseFeedPlan } from "./model.ts";

test("enforceCheckerboard : jamais deux fonds identiques côte à côte ni l'un sous l'autre", () => {
  const fixed = enforceCheckerboard(["brand", "brand", "brand", "brand", "light", "light", "dark", "dark", "dark"]);
  for (let i = 0; i < 9; i++) {
    if (i % 3 > 0) assert.notEqual(fixed[i], fixed[i - 1], `colonne ${i}`);
    if (i >= 3) assert.notEqual(fixed[i], fixed[i - 3], `ligne ${i}`);
  }
  assert.deepEqual(enforceCheckerboard(["brand", "light", "dark"]), ["brand", "light", "dark"]);
});

test("parseFeedPlan borne à 9, corrige les fonds, refuse les tuiles sans titre", () => {
  const tiles = Array.from({ length: 11 }, (_, i) => ({ kind: i % 2 ? "quote" : "nope", background: "brand", headline: i === 4 ? "" : `Titre ${i}`, subline: "", caption: "", cta: "", scene: "", logoPlacement: "top-left" }));
  const plan = parseFeedPlan({ tiles });
  assert.equal(plan.length, 9);
  assert.equal(plan[0].kind, "hook_photo");
  assert.equal(plan[1].kind, "quote");
  assert.notEqual(plan[1].background, plan[0].background);
  assert.ok(!plan.some((t) => t.headline === ""));
});

test("parseCarouselPlan borne entre 3 et 6, et les diapositives ont leur type", () => {
  const slides = Array.from({ length: 8 }, (_, i) => ({ headline: `S${i}`, subline: "", caption: "", cta: "", scene: "", logoPlacement: "top-left" }));
  assert.equal(parseCarouselPlan({ slides }, 4).length, 4);
  assert.equal(parseCarouselPlan({ slides }, 9).length, 6);
  assert.equal(parseCarouselPlan({ slides }, 1).length, 3);
  assert.deepEqual([carouselSlideKind(0, 4), carouselSlideKind(1, 4), carouselSlideKind(3, 4)], ["hook_photo", "hook_photo", "cta"]);
  assert.equal(FEED_PLAN_SCHEMA.additionalProperties, false);
  assert.equal(CAROUSEL_PLAN_SCHEMA.additionalProperties, false);
});

test("les items d'une liste sont bornés, cités dans le prompt et relus", () => {
  const plan = parseTilePlan({ headline: "Trois choses", items: ["Le levain", " La farine ", "", "Le temps", "Quatre", "Cinq", "Six"], logoPlacement: "top-left" });
  assert.deepEqual(plan.items, ["Le levain", "La farine", "Le temps", "Quatre", "Cinq"]);
  const prompt = tilePrompt({ plan, kind: "list", background: "light", graphic: GRAPHIC, os: null, aspectRatio: "1:1", hasLogo: false, brandName: "X" });
  assert.match(prompt, /Exactly 5 items, numbered.*1\. "Le levain" 2\. "La farine"/);
  const noItems = tilePrompt({ plan: { ...plan, items: [] }, kind: "list", background: "light", graphic: GRAPHIC, os: null, aspectRatio: "1:1", hasLogo: false, brandName: "X" });
  assert.match(noItems, /no item list/);
  assert.equal(compareTexts(plan, ["TROIS CHOSES", "le levain", "la farine", "le temps", "quatre"]).ok, false);
  assert.deepEqual(compareTexts(plan, ["TROIS CHOSES", "le levain", "la farine", "le temps", "quatre", "cinq"]).issues, []);
});
