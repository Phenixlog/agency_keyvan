import assert from "node:assert/strict";
import { test } from "node:test";
import { TILE_COPY_SCHEMA, TILE_KINDS, compareTexts, fallbackTilePlan, parseTilePlan, tilePrompt } from "./model.ts";

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
  const bad = compareTexts(plan, ["LE LEVIAN DU SAMEDI", "Cuit à 6h, chaud jusqu’à 10h"]);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.issues, ["Le levain du samedi"]);
});

test("catalogue et schéma", () => {
  assert.equal(Object.keys(TILE_KINDS).length, 10);
  assert.equal(TILE_COPY_SCHEMA.additionalProperties, false);
  assert.deepEqual(TILE_COPY_SCHEMA.properties.logoPlacement.enum, ["top-left", "top-right", "bottom-left", "bottom-right", "bottom-center"]);
});
