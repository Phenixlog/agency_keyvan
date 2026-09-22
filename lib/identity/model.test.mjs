import assert from "node:assert/strict";
import { test } from "node:test";
import { DIRECTIONS_SCHEMA, applyDirection, logoPrompt, moodPrompt, parseDirections } from "./model.ts";

const RAW = {
  directions: [
    { name: "Farine et encre", mood: "Chaleureux.", rationale: "Parce que.", palette: ["brun #A9702C", "crème #F3E8D8", "sans code", "olive #6B7A3A", "noir #1A1815", "trop #000000"], fonts: { display: "Fraunces", body: "Inter" }, logoConcept: "A wordmark with a wheat ear", imageStyle: "warm daylight", graphic: { backgrounds: { brand: "brun #A9702C", light: "pas de code", dark: "noir #1A1815" }, fonts: { display: "", body: "" }, shape: "an arc", stickers: "pills", titles: "bold", logoRule: "Petit." } },
    { name: "Sans palette", palette: ["#FFFFFF"], logoConcept: "x", fonts: {}, graphic: {} },
    { name: "Néon", mood: "", rationale: "", palette: ["rose #FF2D8A", "blanc #FFFFFF", "nuit #0B0B2B"], fonts: { display: "Syne", body: "Manrope" }, logoConcept: "A bold monogram", imageStyle: "flash", graphic: {} },
    { name: "Quatrième", palette: ["a #111111", "b #222222", "c #333333"], logoConcept: "y", fonts: { display: "X", body: "Y" }, graphic: {} },
  ],
};

test("parseDirections garde les directions complètes, 3 au plus, palette codée seulement", () => {
  const dirs = parseDirections(RAW);
  assert.deepEqual(dirs.map((d) => d.name), ["Farine et encre", "Néon", "Quatrième"]);
  assert.deepEqual(dirs[0].palette, ["brun #A9702C", "crème #F3E8D8", "olive #6B7A3A", "noir #1A1815", "trop #000000"]);
  // Fond clair sans code → pris dans la palette ; polices du système reprises de la direction.
  assert.equal(dirs[0].graphic.backgrounds.light, "crème #F3E8D8");
  assert.equal(dirs[0].graphic.fonts.display, "Fraunces");
  assert.equal(dirs[1].graphic.backgrounds.dark, "nuit #0B0B2B");
  assert.deepEqual(parseDirections(null), []);
});

test("les prompts de logo et de moodboard citent le nom exact, la palette et n'ajoutent pas de texte", () => {
  const [dir] = parseDirections(RAW);
  const light = logoPrompt(dir, "Boulangerie Ferrand", "light");
  assert.match(light, /spelled exactly "Boulangerie Ferrand"/);
  assert.match(light, /Fraunces/);
  assert.match(light, /no other text/);
  assert.match(logoPrompt(dir, "X", "avatar"), /monogram or symbol/);
  assert.match(logoPrompt(dir, "X", "dark"), /noir #1A1815/);
  const mood = moodPrompt(dir, { visual: { palette: [] }, business: { offer: "du pain" }, audiences: [{ who: "familles" }] }, 1);
  assert.match(mood, /familles/);
  assert.match(mood, /no text, no logo/);
});

test("applyDirection écrit palette, polices et système graphique dans le Brand OS", () => {
  const [dir] = parseDirections(RAW);
  const os = applyDirection({ name: "F", positioning: "", audience: "", promise: "", tone: [], pillars: [], visual: { palette: ["x #000000"], style: "old", mood: "", avoid: ["a"] }, identity: { exists: "non", fonts: { display: "", body: "" }, nonNegotiables: ["pas de rouge"], dated: [] } }, dir);
  assert.deepEqual(os.visual.palette, dir.palette);
  assert.equal(os.visual.style, "warm daylight");
  assert.deepEqual(os.visual.avoid, ["a"]);
  assert.deepEqual(os.identity.nonNegotiables, ["pas de rouge"]);
  assert.equal(os.identity.fonts.display, "Fraunces");
  assert.equal(os.graphic.shape, "an arc");
  assert.equal(DIRECTIONS_SCHEMA.additionalProperties, false);
});
