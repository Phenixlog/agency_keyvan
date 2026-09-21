import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANNELS, gridRange, groupByDay, isChannel, isValidDay, monthGrid, resolveMonth, shiftMonth, toDay } from "./model.ts";

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
