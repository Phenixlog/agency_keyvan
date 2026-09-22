import assert from "node:assert/strict";
import { test } from "node:test";
import { readAudiences, readBusiness, readOffers, readPresence, readVoice, readiness } from "./onboarding-answers.ts";

const form = (entries) => ({
  get: (name) => (name in entries ? (Array.isArray(entries[name]) ? entries[name][0] : entries[name]) : null),
  getAll: (name) => (name in entries ? [].concat(entries[name]) : []),
});

test("les listes viennent des lignes, bornées, sans vide", () => {
  const b = readBusiness(form({ offer: "  De la  céramique  ", benefits: "Durable\n\n  Faite main ; Locale\nUn quatrième", objective: "Notoriété" }));
  assert.equal(b.offer, "De la céramique");
  assert.deepEqual(b.benefits, ["Durable", "Faite main", "Locale"]);
  assert.equal(b.objective, "Notoriété");
});

test("un public sans « qui » est ignoré, trois au plus", () => {
  const a = readAudiences(form({ a0_who: "Urbains 30-45", a0_desire: "Une table qui a une âme", a1_who: "", a1_desire: "orphelin", a2_who: "Restaurateurs" }));
  assert.deepEqual(a.map((x) => x.who), ["Urbains 30-45", "Restaurateurs"]);
});

test("les curseurs restent entre 1 et 5, sinon l'ancienne valeur", () => {
  const v = readVoice(form({ s_premium: "9", s_serious: "2", address: "tu", tone: "chaleureux\nprécis" }), { says: [], never: [], sliders: { premium: 4, serious: 3, discreet: 3, institutional: 3, minimal: 3 } });
  assert.equal(v.sliders.premium, 4);
  assert.equal(v.sliders.serious, 2);
  assert.equal(v.address, "tu");
  assert.deepEqual(v.tone, ["chaleureux", "précis"]);
  assert.equal(readVoice(form({ address: "nous" }), undefined).address, "");
});

test("offres, cases à cocher et fréquence", () => {
  const o = readOffers(form({ o0_name: "Bol Lune", o0_line: "Le bol du matin", o1_name: "", o1_line: "sans nom", showPrices: "parfois" }));
  assert.deepEqual(o.items, [{ name: "Bol Lune", line: "Le bol du matin" }]);
  assert.equal(o.showPrices, "parfois");
  const p = readPresence(form({ active: ["instagram", "site"], formats: "Post Instagram", frequency: "turbo" }));
  assert.deepEqual(p.active, ["instagram", "site"]);
  assert.deepEqual(p.formats, ["Post Instagram"]);
  assert.equal(p.frequency, "");
});

test("readiness dit ce qui manque, et où le corriger", () => {
  const os = { positioning: "À préciser", promise: "", tone: ["clair"], pillars: [], visual: { palette: ["terracotta"], style: "photo", mood: "", avoid: [] }, voice: { says: [], never: [] } };
  const blocks = readiness(os);
  assert.ok(blocks.every((b) => !b.ok));
  assert.deepEqual([...new Set(blocks.map((b) => b.step))], [4, 5, 6]);
  const full = { ...os, positioning: "Céramique utilitaire pour les tables urbaines", promise: "Des objets qui durent", business: { offer: "Bols", sector: "", area: "", benefits: ["Durable"], alternative: "", objective: "Notoriété" }, audiences: [{ who: "x", desire: "", objection: "", proof: "" }], tone: ["a", "b"], voice: { says: ["Bonjour"], never: [], must: ["atelier"] }, visual: { palette: ["terracotta #C4572E"], style: "photo", mood: "", avoid: [] }, presence: { active: [], push: ["instagram"], formats: [], frequency: "" } };
  assert.ok(readiness(full).every((b) => b.ok));
});
