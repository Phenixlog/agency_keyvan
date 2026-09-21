import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANNELS, PLAN_SCHEMA, fallbackPlan, gridRange, groupByDay, isChannel, isValidDay, missingSlots, monthGrid, parsePlan, ratioMismatch, resolveMonth, shiftMonth, toDay, weekGaps } from "./model.ts";
import { CADENCE_CHANNELS, parseProposal } from "../expert/proposal.ts";

test("monthGrid : semaines complètes du lundi au dimanche", () => {
  // Septembre 2026 commence un mardi et finit un mercredi.
  const weeks = monthGrid("2026-09");
  assert.equal(weeks.length, 5);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.deepEqual(weeks[0][0], { day: "2026-08-31", inMonth: false });
  assert.deepEqual(weeks[0][1], { day: "2026-09-01", inMonth: true });
  assert.deepEqual(weeks[4][6], { day: "2026-10-04", inMonth: false });
  assert.equal(weeks.flat().filter((d) => d.inMonth).length, 30);
});

test("monthGrid : mois commençant un lundi, un dimanche, et février", () => {
  assert.equal(monthGrid("2026-06")[0][0].day, "2026-06-01"); // lundi
  assert.equal(monthGrid("2026-11")[0][6].day, "2026-11-01"); // dimanche → 6 semaines
  assert.equal(monthGrid("2026-11").length, 6);
  assert.equal(monthGrid("2027-02").flat().filter((d) => d.inMonth).length, 28);
  assert.equal(monthGrid("2028-02").flat().filter((d) => d.inMonth).length, 29); // bissextile
});

test("gridRange couvre exactement la grille affichée", () => {
  assert.deepEqual(gridRange("2026-09"), { from: "2026-08-31", to: "2026-10-04" });
});

test("shiftMonth passe les années", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-09", 0), "2026-09");
});

test("resolveMonth refuse toute valeur qui n'est pas AAAA-MM", () => {
  assert.equal(resolveMonth("2027-03", "2026-09-21"), "2027-03");
  for (const bad of [undefined, "", "2026-13", "2026-9", "../../etc", "2026-09-01"]) {
    assert.equal(resolveMonth(bad, "2026-09-21"), "2026-09");
  }
});

test("isValidDay refuse les dates impossibles ou hors bornes", () => {
  assert.equal(isValidDay("2026-09-21"), true);
  assert.equal(isValidDay("2028-02-29"), true);
  for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "21/09/2026", "", "1999-01-01", "2101-01-01"]) {
    assert.equal(isValidDay(bad), false, bad);
  }
});

test("toDay utilise la date locale, sans décalage de fuseau", () => {
  assert.equal(toDay(new Date(2026, 8, 21, 23, 59)), "2026-09-21");
  assert.equal(toDay(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
});

test("isChannel et groupByDay", () => {
  assert.equal(isChannel("instagram"), true);
  assert.equal(isChannel("myspace"), false);
  assert.equal(Object.keys(CHANNELS).length, 8);
  const grouped = groupByDay([{ scheduled_on: "2026-09-21", id: 1 }, { scheduled_on: "2026-09-22", id: 2 }, { scheduled_on: "2026-09-21", id: 3 }]);
  assert.deepEqual(grouped.get("2026-09-21").map((e) => e.id), [1, 3]);
  assert.equal(grouped.get("2026-09-23"), undefined);
});

/* ---------------- Rythme, format, proposition du mois ---------------- */

const CADENCE = [{ channel: "instagram", perWeek: 2 }, { channel: "linkedin", perWeek: 1 }, { channel: "minitel", perWeek: 3 }];
const WEEK = monthGrid("2026-09")[3].map((d) => d.day); // 21 → 27 septembre
const ENTRIES = [
  { scheduled_on: "2026-09-22", channel: "instagram", status: "planned" },
  { scheduled_on: "2026-09-23", channel: "instagram", status: "proposed" }, // pas encore acceptée : ne compte pas
  { scheduled_on: "2026-09-24", channel: "linkedin", status: "canceled" },
  { scheduled_on: "2026-09-15", channel: "instagram", status: "published" }, // autre semaine
];

test("les canaux de la cadence (expert) et ceux du calendrier sont les mêmes", () => {
  assert.deepEqual([...CADENCE_CHANNELS], Object.keys(CHANNELS));
});

test("la cadence proposée par l'expert est validée : canal connu, 1 à 14 par semaine", () => {
  const proposal = parseProposal({ title: "Rythme", reason: "x", brand_os: { strategy: { cadence: [{ channel: "Instagram", perWeek: 2 }, { channel: "minitel", perWeek: 1 }, { channel: "x", perWeek: 99 }] } } });
  assert.deepEqual(proposal.brand_os.strategy.cadence, [{ channel: "instagram", perWeek: 2 }]);
});

test("weekGaps compte ce qui est accepté, canal par canal, et ignore un canal inconnu", () => {
  assert.deepEqual(weekGaps(CADENCE, WEEK, ENTRIES), [
    { channel: "instagram", expected: 2, planned: 1 },
    { channel: "linkedin", expected: 1, planned: 0 },
  ]);
  assert.deepEqual(weekGaps(undefined, WEEK, ENTRIES), []);
});

test("missingSlots ignore les semaines sans jour restant", () => {
  const weeks = monthGrid("2026-09").map((w) => w.map((d) => d.day));
  const days = ["2026-09-25", "2026-09-26", "2026-09-28", "2026-09-29", "2026-09-30"];
  const missing = missingSlots(CADENCE, weeks, ENTRIES, days);
  assert.deepEqual([...missing], [["2026-09-21|instagram", 1], ["2026-09-21|linkedin", 1], ["2026-09-28|instagram", 2], ["2026-09-28|linkedin", 1]]);
});

test("ratioMismatch : une story TikTok en 16:9 est signalée, une newsletter accepte tout", () => {
  assert.deepEqual(ratioMismatch("tiktok", "16:9"), ["9:16"]);
  assert.equal(ratioMismatch("instagram", "4:5"), null);
  assert.equal(ratioMismatch("newsletter", "21:9"), null);
  assert.equal(ratioMismatch("instagram", null), null);
});

test("parsePlan ne fait pas confiance au planneur", () => {
  const limits = { days: ["2026-09-25", "2026-09-26", "2026-09-29"], taken: ["2026-09-25|instagram"], creations: 2, missing: new Map([["2026-09-21|instagram", 1], ["2026-09-28|instagram", 2]]) };
  const plan = parsePlan(
    {
      items: [
        { day: "2026-09-25", channel: "instagram", angle: "a", creation: 1, idea: "" }, // déjà pris
        { day: "2026-09-26", channel: "instagram", angle: "  Coulisses   de l'atelier ", creation: 1, idea: "" },
        { day: "2026-09-26", channel: "linkedin", angle: "a", creation: 2, idea: "" }, // rien ne manque sur ce canal
        { day: "2026-09-29", channel: "instagram", angle: "b", creation: 1, idea: "" }, // création déjà utilisée, pas d'idée → écartée
        { day: "2026-09-29", channel: "instagram", angle: "b", creation: 7, idea: "Un bol fumant" }, // numéro inconnu → à créer
        { day: "2026-13-40", channel: "instagram", angle: "c", creation: 0, idea: "x" }, // jour hors liste
        { day: "2026-09-29", channel: "minitel", angle: "c", creation: 0, idea: "x" },
      ],
    },
    limits
  );
  assert.deepEqual(plan, [
    { day: "2026-09-26", channel: "instagram", angle: "Coulisses de l'atelier", creation: 1, idea: "" },
    { day: "2026-09-29", channel: "instagram", angle: "b", creation: 0, idea: "Un bol fumant" },
  ]);
  assert.deepEqual(parsePlan(null, limits), []);
});

test("fallbackPlan comble ce qui manque, mardi et jeudi d'abord, créations prêtes d'abord", () => {
  const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].filter((d) => d.startsWith("2026-09"));
  const plan = fallbackPlan({ days, taken: [], creations: 1, missing: new Map([["2026-09-28|instagram", 2]]), angles: ["Savoir-faire", "Coulisses"] });
  assert.deepEqual(plan.map((p) => [p.day, p.creation, p.angle]), [["2026-09-28", 0, "Coulisses"], ["2026-09-29", 1, "Savoir-faire"]]);
  assert.ok(plan[0].idea.includes("Coulisses"));
  // Sans cadence chiffrée, rien à calculer : on ne propose rien plutôt que d'inventer un rythme.
  assert.deepEqual(fallbackPlan({ days, taken: [], creations: 1, angles: [] }), []);
});

test("le schéma du plan est strict", () => {
  assert.equal(PLAN_SCHEMA.additionalProperties, false);
  assert.deepEqual(PLAN_SCHEMA.properties.items.items.required, ["day", "channel", "angle", "creation", "idea"]);
  assert.deepEqual(PLAN_SCHEMA.properties.items.items.properties.channel.enum, Object.keys(CHANNELS));
});
