import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { T, brandColorFromPalette, brandStyle, brandSurface, contrastRatio, onBrand } from "./tokens.ts";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const cssVar = (name) => {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `--${name} absent de app/globals.css`);
  return match[1].trim();
};
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

test("globals.css est le miroir exact de lib/tokens.ts", () => {
  for (const [name, hex] of Object.entries(T.color)) {
    if (name === "brandDefault") continue;
    assert.equal(cssVar(`color-${kebab(name)}`).toUpperCase(), hex.toUpperCase(), `color.${name}`);
  }
  assert.equal(cssVar("color-brand").toUpperCase(), T.color.brandDefault.toUpperCase());
  for (const [name, px] of Object.entries(T.radius)) {
    assert.equal(cssVar(`radius-${name}`), `${px}px`, `radius.${name}`);
  }
  for (const [name, value] of Object.entries(T.shadow)) {
    assert.equal(cssVar(`shadow-${name}`), value, `shadow.${name}`);
  }
  for (const name of ["display", "h1", "h2", "title", "body", "small", "meta"]) {
    assert.equal(cssVar(`text-${name}`), `${T.font[name].size}px`, `font.${name}.size`);
    assert.equal(cssVar(`text-${name}--line-height`), String(T.font[name].lineHeight), `font.${name}.lineHeight`);
  }
  assert.equal(cssVar("duration-retint"), T.motion.retint);
  assert.equal(cssVar("ease-cimaise"), T.motion.ease);
  for (const [name, part] of [["tint", "tint"], ["tint-strong", "tintStrong"], ["highlighter", "highlighter"]]) {
    assert.match(cssVar(`color-${name}`), new RegExp(`var\\(--color-brand\\) ${T.brandMix[part]}%`), `brandMix.${part}`);
  }
});

test("l'espacement suit la grille 8 px", () => {
  for (const [name, px] of Object.entries(T.space)) {
    assert.equal(px % (name === "xs" ? 4 : 8), 0, `space.${name}`);
  }
});

test("chaque paire texte/fond de la DA tient le contraste AA (4,5:1)", () => {
  const c = T.color;
  const pairs = [
    ["ink", "scene"], ["ink", "shell"], ["ink", "card"], ["ink", "soft"],
    ["mute", "shell"], ["mute", "card"], ["mute", "soft"],
    ["card", "ink"],
    ["success", "successTint"], ["danger", "dangerTint"], ["warning", "warningTint"],
    ["success", "card"], ["danger", "card"],
  ];
  for (const [fg, bg] of pairs) {
    const ratio = contrastRatio(c[fg], c[bg]);
    assert.ok(ratio >= 4.5, `${fg} sur ${bg} = ${ratio.toFixed(2)}:1`);
  }
});

test("le texte sur un aplat de couleur cliente reste lisible, quelle que soit la marque", () => {
  const brands = ["#C4572E", "#1F7A4D", "#2B3A8C", "#E8D44D", "#FFFFFF", "#000000", "#FF00FF", "#7F7F7F", "#00E5FF"];
  for (const brand of brands) {
    const surface = brandSurface(brand);
    const ratio = contrastRatio(surface, onBrand(surface));
    assert.ok(ratio >= 4.5, `${brand} → aplat ${surface}, texte ${onBrand(surface)} = ${ratio.toFixed(2)}:1`);
  }
  assert.equal(onBrand("#E8D44D"), T.color.ink);
  assert.equal(onBrand("#2B3A8C"), T.color.card);
  // Une couleur déjà conforme n'est jamais retouchée ; une couleur moyenne l'est à peine.
  assert.equal(brandSurface("#2B3A8C"), "#2B3A8C");
  assert.equal(brandSurface("#E8D44D"), "#E8D44D");
  assert.equal(brandSurface("#C4572E"), "#C0552D");
});

test("brandColorFromPalette trouve le premier hex, sinon retombe sur la valeur par défaut", () => {
  assert.equal(brandColorFromPalette(["terracotta", "ivoire", "#2f4f4f"]), "#2F4F4F");
  assert.equal(brandColorFromPalette(["bleu nuit (#1b2a4a)", "#fff"]), "#1B2A4A");
  assert.equal(brandColorFromPalette(["#abc"]), "#AABBCC");
  assert.equal(brandColorFromPalette(["terracotta", "sable"]), T.color.brandDefault);
  assert.equal(brandColorFromPalette(null), T.color.brandDefault);
});

test("brandStyle refuse toute valeur qui n'est pas un hex (pas d'injection CSS)", () => {
  assert.deepEqual(brandStyle("#2B3A8C"), { "--color-brand": "#2B3A8C", "--color-on-brand": T.color.card });
  for (const bad of ["red; background:url(x)", "#12345", "", null, undefined]) {
    assert.equal(brandStyle(bad)["--color-brand"], T.color.brandDefault);
  }
});
