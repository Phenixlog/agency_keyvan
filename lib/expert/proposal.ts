/**
 * Ce que l'expert a le droit de proposer de changer dans le « cerveau » d'une marque, comment on
 * le valide, comment on l'applique et comment on le montre (avant → après).
 * Module pur : il ne connaît ni la base ni le réseau, et ne fait confiance à aucune entrée.
 */
// Type-only import: erased at runtime, so the node test runner never resolves the alias.
import type { BrandGraphic, BrandOS, BrandStrategy, BrandVoice, Cadence, MegaPrompt } from "@/lib/brand-os/model";

export type Proposal = {
  /** Le changement en une ligne, tel qu'il apparaîtra dans l'historique. */
  title: string;
  /** Pourquoi : ce que l'expert a constaté. */
  reason: string;
  brand_os?: {
    positioning?: string;
    audience?: string;
    promise?: string;
    tone?: string[];
    voice?: Partial<BrandVoice>;
    pillars?: string[];
    visual?: { palette?: string[]; style?: string; mood?: string; avoid?: string[] };
    strategy?: Partial<BrandStrategy>;
    graphic?: Partial<BrandGraphic>;
  };
  /** Consignes créatives permanentes (le texte du mega-prompt). */
  guidance?: string;
  rules?: { add?: string[]; remove?: string[]; replace?: { from: string; to: string }[] };
};

export const PROPOSAL_FENCE = "proposition";
export const MAX_RULES = 12;
const MAX_TEXT = 600;
const MAX_GUIDANCE = 2_000;
const MAX_ITEMS = 8;
const MAX_ITEM = 200;

/* ------------------------------------------------------------------ */
/* Lecture de la réponse du modèle                                      */
/* ------------------------------------------------------------------ */

const FENCE_OPEN = new RegExp("```\\s*" + PROPOSAL_FENCE + "\\s*\\n?", "i");

/**
 * Sépare le texte destiné à l'utilisateur du bloc ```proposition … ```.
 * Pendant le streaming le bloc est incomplet : `pending` dit qu'une proposition est en cours
 * d'écriture, pour ne jamais afficher de JSON brut.
 */
export function splitAnswer(answer: string): { text: string; raw: string | null; pending: boolean } {
  const open = answer.match(FENCE_OPEN);
  if (!open || open.index === undefined) return { text: answer.trim(), raw: null, pending: false };
  const text = answer.slice(0, open.index).trim();
  const rest = answer.slice(open.index + open[0].length);
  const close = rest.indexOf("```");
  if (close < 0) return { text, raw: null, pending: true };
  const after = rest.slice(close + 3).trim();
  return { text: [text, after].filter(Boolean).join("\n\n"), raw: rest.slice(0, close).trim(), pending: false };
}

const str = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, max);
  return text || undefined;
};

const list = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = Array.from(new Set(value.map((v) => str(v, MAX_ITEM)).filter((v): v is string => Boolean(v)))).slice(0, MAX_ITEMS);
  return items.length ? items : undefined;
};

/** Canaux du calendrier. Copie volontaire de `CHANNELS` (module pur, sans import local) : un test garantit la parité. */
export const CADENCE_CHANNELS = ["instagram", "linkedin", "facebook", "tiktok", "x", "newsletter", "print", "autre"] as const;
const MAX_PER_WEEK = 14;

/** « Instagram, 2 par semaine » en chiffres. Canal inconnu ou nombre absurde : la ligne est ignorée. */
const cadence = (value: unknown): Cadence[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const byChannel = new Map<string, number>();
  for (const item of value) {
    const channel = String((item as { channel?: unknown })?.channel ?? "").trim().toLowerCase();
    const perWeek = Math.round(Number((item as { perWeek?: unknown })?.perWeek));
    if ((CADENCE_CHANNELS as readonly string[]).includes(channel) && perWeek >= 1 && perWeek <= MAX_PER_WEEK) byChannel.set(channel, perWeek);
  }
  return byChannel.size ? Array.from(byChannel, ([channel, perWeek]) => ({ channel, perWeek })) : undefined;
};

/** Retire les clés `undefined` ; renvoie `undefined` si l'objet est vide. */
function compact<T extends Record<string, unknown>>(object: T): T | undefined {
  const entries = Object.entries(object).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

/**
 * Validation stricte : ne garde que les champs connus, aux bons types, bornés en taille.
 * Sert pour ce que renvoie le modèle ET pour ce que renvoie le navigateur au moment d'appliquer.
 */
export function parseProposal(input: unknown): Proposal | null {
  let data = input;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const os = (d.brand_os ?? {}) as Record<string, unknown>;
  const visual = (os.visual ?? {}) as Record<string, unknown>;
  const voice = (os.voice ?? {}) as Record<string, unknown>;
  const strategy = (os.strategy ?? {}) as Record<string, unknown>;
  const graphic = (os.graphic ?? {}) as Record<string, unknown>;
  const backgrounds = (graphic.backgrounds ?? {}) as Record<string, unknown>;
  const fonts = (graphic.fonts ?? {}) as Record<string, unknown>;
  const rules = (d.rules ?? {}) as Record<string, unknown>;

  const replace = Array.isArray(rules.replace)
    ? rules.replace
        .map((r) => ({ from: str((r as { from?: unknown })?.from, MAX_ITEM), to: str((r as { to?: unknown })?.to, MAX_ITEM) }))
        .filter((r): r is { from: string; to: string } => Boolean(r.from && r.to))
        .slice(0, MAX_ITEMS)
    : [];

  const proposal: Proposal = {
    title: str(d.title, 140) ?? "",
    reason: str(d.reason, MAX_TEXT) ?? "",
    brand_os: compact({
      positioning: str(os.positioning, MAX_TEXT),
      audience: str(os.audience, MAX_TEXT),
      promise: str(os.promise, MAX_TEXT),
      tone: list(os.tone),
      voice: compact({ says: list(voice.says), never: list(voice.never) }),
      pillars: list(os.pillars),
      visual: compact({ palette: list(visual.palette), style: str(visual.style, MAX_TEXT), mood: str(visual.mood, MAX_TEXT), avoid: list(visual.avoid) }),
      strategy: compact({ objectives: list(strategy.objectives), channels: list(strategy.channels), angles: list(strategy.angles), rhythm: str(strategy.rhythm, MAX_TEXT), cadence: cadence(strategy.cadence) }),
      graphic: compact({
        backgrounds: compact({ brand: str(backgrounds.brand, MAX_ITEM), light: str(backgrounds.light, MAX_ITEM), dark: str(backgrounds.dark, MAX_ITEM) }) as BrandGraphic["backgrounds"] | undefined,
        fonts: compact({ display: str(fonts.display, 60), body: str(fonts.body, 60) }) as BrandGraphic["fonts"] | undefined,
        shape: str(graphic.shape, MAX_ITEM),
        stickers: str(graphic.stickers, MAX_ITEM),
        titles: str(graphic.titles, MAX_ITEM),
        logoRule: str(graphic.logoRule, MAX_ITEM),
      }),
    }),
    guidance: str(d.guidance, MAX_GUIDANCE),
    rules: compact({ add: list(rules.add), remove: list(rules.remove), replace: replace.length ? replace : undefined }),
  };
  if (!proposal.title) return null;
  if (!proposal.brand_os && !proposal.guidance && !proposal.rules) return null;
  return proposal;
}

/* ------------------------------------------------------------------ */
/* Application                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_STRATEGY: BrandStrategy = { objectives: [], channels: [], angles: [], rhythm: "" };
const EMPTY_GRAPHIC: BrandGraphic = { backgrounds: { brand: "", light: "", dark: "" }, fonts: { display: "", body: "" }, shape: "", stickers: "", titles: "", logoRule: "" };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function applyToBrandOS(os: BrandOS, proposal: Proposal): BrandOS {
  const patch = proposal.brand_os;
  if (!patch) return os;
  const strategy = patch.strategy ? { ...EMPTY_STRATEGY, ...os.strategy, ...patch.strategy } : os.strategy;
  const voice = patch.voice ? { says: [], never: [], ...os.voice, ...patch.voice } : os.voice;
  const graphic = patch.graphic
    ? {
        ...EMPTY_GRAPHIC,
        ...os.graphic,
        ...patch.graphic,
        backgrounds: { ...EMPTY_GRAPHIC.backgrounds, ...os.graphic?.backgrounds, ...patch.graphic.backgrounds },
        fonts: { ...EMPTY_GRAPHIC.fonts, ...os.graphic?.fonts, ...patch.graphic.fonts },
      }
    : os.graphic;
  return {
    ...os,
    ...compact({ positioning: patch.positioning, audience: patch.audience, promise: patch.promise, tone: patch.tone, pillars: patch.pillars }),
    visual: { ...os.visual, ...patch.visual },
    ...(voice ? { voice } : {}),
    ...(strategy ? { strategy } : {}),
    ...(graphic ? { graphic } : {}),
  };
}

export function applyToMega(mega: MegaPrompt, proposal: Proposal): MegaPrompt {
  let rules = [...mega.rules];
  for (const { from, to } of proposal.rules?.replace ?? []) {
    const index = rules.findIndex((rule) => same(rule, from));
    // A rule the model misquoted is still the user's intent: add the new wording rather than lose it.
    if (index >= 0) rules[index] = to;
    else rules.push(to);
  }
  for (const gone of proposal.rules?.remove ?? []) rules = rules.filter((rule) => !same(rule, gone));
  for (const added of proposal.rules?.add ?? []) if (!rules.some((rule) => same(rule, added))) rules.push(added);
  return { ...mega, intro: proposal.guidance ?? mega.intro, rules: rules.slice(-MAX_RULES) };
}

/* ------------------------------------------------------------------ */
/* Avant → après                                                        */
/* ------------------------------------------------------------------ */

export type Change = { label: string; before: string; after: string };

const show = (value: string | readonly string[] | undefined) => (Array.isArray(value) ? value.join(" · ") : ((value as string | undefined) ?? "")).trim();

const showGraphicBackgrounds = (g: BrandGraphic | undefined) => (g ? [g.backgrounds.brand, g.backgrounds.light, g.backgrounds.dark].filter(Boolean) : []);
const showCadence = (value: readonly Cadence[] | undefined) => (value ?? []).map((c) => `${c.channel} ${c.perWeek}/semaine`);

/** Uniquement ce qui change réellement : une proposition qui redit l'existant ne montre rien. */
export function describeChanges(os: BrandOS, mega: MegaPrompt, proposal: Proposal): Change[] {
  const nextOS = applyToBrandOS(os, proposal);
  const nextMega = applyToMega(mega, proposal);
  const pairs: [string, string | readonly string[] | undefined, string | readonly string[] | undefined][] = [
    ["Positionnement", os.positioning, nextOS.positioning],
    ["Cible", os.audience, nextOS.audience],
    ["Promesse", os.promise, nextOS.promise],
    ["Ton", os.tone, nextOS.tone],
    ["Voix · elle dirait", os.voice?.says, nextOS.voice?.says],
    ["Voix · jamais", os.voice?.never, nextOS.voice?.never],
    ["Piliers éditoriaux", os.pillars, nextOS.pillars],
    ["Palette", os.visual.palette, nextOS.visual.palette],
    ["Style d’image", os.visual.style, nextOS.visual.style],
    ["Ambiance", os.visual.mood, nextOS.visual.mood],
    ["À éviter", os.visual.avoid, nextOS.visual.avoid],
    ["Stratégie · objectifs", os.strategy?.objectives, nextOS.strategy?.objectives],
    ["Stratégie · canaux", os.strategy?.channels, nextOS.strategy?.channels],
    ["Stratégie · angles", os.strategy?.angles, nextOS.strategy?.angles],
    ["Stratégie · rythme", os.strategy?.rhythm, nextOS.strategy?.rhythm],
    ["Stratégie · cadence", showCadence(os.strategy?.cadence), showCadence(nextOS.strategy?.cadence)],
    ["Tuiles · fonds", showGraphicBackgrounds(os.graphic), showGraphicBackgrounds(nextOS.graphic)],
    ["Tuiles · polices", [os.graphic?.fonts.display, os.graphic?.fonts.body].filter(Boolean) as string[], [nextOS.graphic?.fonts.display, nextOS.graphic?.fonts.body].filter(Boolean) as string[]],
    ["Tuiles · forme signature", os.graphic?.shape, nextOS.graphic?.shape],
    ["Tuiles · stickers", os.graphic?.stickers, nextOS.graphic?.stickers],
    ["Tuiles · titres", os.graphic?.titles, nextOS.graphic?.titles],
    ["Tuiles · logo", os.graphic?.logoRule, nextOS.graphic?.logoRule],
    ["Consignes créatives", mega.intro, nextMega.intro],
  ];
  const changes = pairs
    .map(([label, before, after]) => ({ label, before: show(before), after: show(after) }))
    .filter((change) => change.before !== change.after);

  const removed = mega.rules.filter((rule) => !nextMega.rules.some((r) => same(r, rule)));
  const added = nextMega.rules.filter((rule) => !mega.rules.some((r) => same(r, rule)));
  for (const rule of removed) changes.push({ label: "Règle retirée", before: rule, after: "" });
  for (const rule of added) changes.push({ label: "Nouvelle règle", before: "", after: rule });
  return changes;
}

export function touches(proposal: Proposal): { brandOS: boolean; mega: boolean } {
  return { brandOS: Boolean(proposal.brand_os), mega: Boolean(proposal.guidance || proposal.rules) };
}
