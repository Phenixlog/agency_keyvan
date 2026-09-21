import assert from "node:assert/strict";
import { test } from "node:test";
import { applyToBrandOS, applyToMega, describeChanges, parseProposal, splitAnswer, touches } from "./proposal.ts";

const OS = {
  name: "Atelier Lune",
  positioning: "Céramique utilitaire faite main",
  audience: "Trentenaires urbains",
  promise: "Des objets qui durent",
  tone: ["chaleureux", "précis"],
  pillars: ["le geste", "la matière"],
  visual: { palette: ["terracotta", "ivoire"], style: "photo naturelle", mood: "calme", avoid: ["fond blanc studio"] },
};
const MEGA = { intro: "Montrer l\u2019usage.", rules: ["Toujours une trace d\u2019usage", "Beaucoup de bleu"], changelog: [] };

test("splitAnswer sépare le texte du bloc proposition, y compris pendant le streaming", () => {
  assert.deepEqual(splitAnswer("Bonjour."), { text: "Bonjour.", raw: null, pending: false });

  const streaming = splitAnswer("Je propose ceci.\n\n```proposition\n{\"title\": \"Pal");
  assert.deepEqual(streaming, { text: "Je propose ceci.", raw: null, pending: true });

  const done = splitAnswer("Je propose ceci.\n\n```proposition\n{\"title\":\"x\"}\n```\n");
  assert.equal(done.text, "Je propose ceci.");
  assert.equal(done.raw, '{"title":"x"}');
  assert.equal(done.pending, false);

  // Un bloc de code ordinaire n'est pas une proposition.
  assert.equal(splitAnswer("```json\n{}\n```").raw, null);
});

test("parseProposal ne garde que les champs connus, typés et bornés", () => {
  const parsed = parseProposal({
    title: "  Palette en codes couleur  ",
    reason: "Les 4 dernières images sont grises.",
    brand_os: { visual: { palette: ["#C4572E", "#C4572E", 42, ""], hack: "x" }, name: "Autre marque", strategy: { rhythm: " 2 posts / semaine " } },
    rules: { add: ["La terracotta domine"], remove: "pas une liste", replace: [{ from: "Beaucoup de bleu", to: "Peu de bleu" }, { from: "x" }] },
    sql: "drop table brands",
  });
  assert.deepEqual(parsed, {
    title: "Palette en codes couleur",
    reason: "Les 4 dernières images sont grises.",
    brand_os: { visual: { palette: ["#C4572E"] }, strategy: { rhythm: "2 posts / semaine" } },
    guidance: undefined,
    rules: { add: ["La terracotta domine"], replace: [{ from: "Beaucoup de bleu", to: "Peu de bleu" }] },
  });
  assert.equal("name" in parsed.brand_os, false, "le nom de la marque n'est pas modifiable par l'expert");
});

test("parseProposal refuse ce qui n'est pas une proposition exploitable", () => {
  for (const bad of [null, 42, [], "pas du json", "{", { title: "sans changement" }, { brand_os: { promise: "x" } }, { title: "vide", brand_os: { visual: {} }, rules: {} }]) {
    assert.equal(parseProposal(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseProposal('{"title":"ok","guidance":"Montrer des mains."}').guidance, "Montrer des mains.");
  assert.equal(parseProposal({ title: "t", guidance: "x".repeat(5000) }).guidance.length, 2000);
  assert.equal(parseProposal({ title: "t", rules: { add: Array.from({ length: 30 }, (_, i) => `r${i}`) } }).rules.add.length, 8);
});

test("applyToBrandOS fusionne sans rien perdre de ce qui n'est pas visé", () => {
  const next = applyToBrandOS(OS, parseProposal({ title: "t", brand_os: { visual: { palette: ["#C4572E", "ivoire"] }, tone: ["affirmé"], strategy: { channels: ["Instagram"] } } }));
  assert.deepEqual(next.visual, { ...OS.visual, palette: ["#C4572E", "ivoire"] });
  assert.deepEqual(next.tone, ["affirmé"]);
  assert.equal(next.positioning, OS.positioning);
  assert.equal(next.name, "Atelier Lune");
  assert.deepEqual(next.strategy, { objectives: [], channels: ["Instagram"], angles: [], rhythm: "" });
  assert.equal(OS.strategy, undefined, "l'original n'est pas muté");

  const later = applyToBrandOS(next, parseProposal({ title: "t", brand_os: { strategy: { rhythm: "2 / semaine" } } }));
  assert.deepEqual(later.strategy, { objectives: [], channels: ["Instagram"], angles: [], rhythm: "2 / semaine" });
  assert.equal(applyToBrandOS(OS, parseProposal({ title: "t", guidance: "x" })), OS);
});

test("applyToMega remplace, retire et ajoute des règles, sans doublon, 12 au plus", () => {
  const next = applyToMega(MEGA, parseProposal({
    title: "t",
    guidance: "Montrer l\u2019usage, en lumière naturelle.",
    rules: { replace: [{ from: "beaucoup de BLEU ", to: "Peu de bleu" }], add: ["Jamais de fleurs", "peu de bleu"], remove: ["règle inconnue"] },
  }));
  assert.deepEqual(next.rules, ["Toujours une trace d\u2019usage", "Peu de bleu", "Jamais de fleurs"]);
  assert.equal(next.intro, "Montrer l\u2019usage, en lumière naturelle.");
  assert.deepEqual(MEGA.rules, ["Toujours une trace d\u2019usage", "Beaucoup de bleu"], "l'original n'est pas muté");

  const removed = applyToMega(MEGA, parseProposal({ title: "t", rules: { remove: ["Beaucoup de bleu"] } }));
  assert.deepEqual(removed.rules, ["Toujours une trace d\u2019usage"]);
  assert.equal(removed.intro, MEGA.intro);

  // Une règle mal citée par le modèle : la nouvelle formulation est ajoutée plutôt que perdue.
  const misquoted = applyToMega(MEGA, parseProposal({ title: "t", rules: { replace: [{ from: "inexistante", to: "Nouvelle" }] } }));
  assert.deepEqual(misquoted.rules, [...MEGA.rules, "Nouvelle"]);

  const full = { ...MEGA, rules: Array.from({ length: 12 }, (_, i) => `règle ${i}`) };
  assert.equal(applyToMega(full, parseProposal({ title: "t", rules: { add: ["treizième"] } })).rules.length, 12);
});

test("describeChanges ne montre que ce qui change vraiment", () => {
  const proposal = parseProposal({
    title: "t",
    brand_os: { promise: OS.promise, visual: { palette: ["#C4572E", "ivoire"] }, strategy: { channels: ["Instagram", "LinkedIn"] } },
    rules: { replace: [{ from: "Beaucoup de bleu", to: "Peu de bleu" }] },
  });
  assert.deepEqual(describeChanges(OS, MEGA, proposal), [
    { label: "Palette", before: "terracotta · ivoire", after: "#C4572E · ivoire" },
    { label: "Stratégie · canaux", before: "", after: "Instagram · LinkedIn" },
    { label: "Règle retirée", before: "Beaucoup de bleu", after: "" },
    { label: "Nouvelle règle", before: "", after: "Peu de bleu" },
  ]);
  assert.deepEqual(describeChanges(OS, MEGA, parseProposal({ title: "t", brand_os: { promise: OS.promise } })), []);
});

test("touches dit quelles versions seront créées", () => {
  assert.deepEqual(touches(parseProposal({ title: "t", brand_os: { promise: "x" } })), { brandOS: true, mega: false });
  assert.deepEqual(touches(parseProposal({ title: "t", rules: { add: ["x"] }, guidance: "y" })), { brandOS: false, mega: true });
});

test("la voix en exemples se propose, se fusionne et se montre", () => {
  const proposal = parseProposal({ title: "Voix plus affirmée", brand_os: { voice: { says: ["On ne fait pas de série infinie."], never: 12 } } });
  assert.deepEqual(proposal.brand_os, { voice: { says: ["On ne fait pas de série infinie."] } });
  const next = applyToBrandOS({ ...OS, voice: { says: ["Ancienne"], never: ["Découvrez nos nouveautés !"] } }, proposal);
  assert.deepEqual(next.voice, { says: ["On ne fait pas de série infinie."], never: ["Découvrez nos nouveautés !"] });
  assert.deepEqual(applyToBrandOS(OS, proposal).voice, { says: ["On ne fait pas de série infinie."], never: [] });
  assert.deepEqual(describeChanges(OS, MEGA, proposal), [{ label: "Voix · elle dirait", before: "", after: "On ne fait pas de série infinie." }]);
});
