/**
 * Le questionnaire d'onboarding : lecture des formulaires (préremplis par l'IA, corrigés par
 * l'utilisateur) vers les blocs du Brand OS, et l'état de préparation de la fiche.
 * Module pur : aucun import local hors types.
 */
import type { BrandAudience, BrandBusiness, BrandIdentity, BrandOS, BrandOffers, BrandPresence, BrandVoice, VoiceSliders } from "@/lib/brand-os/model";

/** Ce qu'un formulaire HTML donne : une valeur par nom, ou plusieurs (cases à cocher). */
export type Form = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };

const MAX_LINE = 300;
const MAX_ITEMS = 8;
const MAX_AUDIENCES = 3;

const text = (form: Form, name: string, max = MAX_LINE): string => String(form.get(name) ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** Une entrée par ligne (textarea) : « un bénéfice par ligne ». */
const lines = (form: Form, name: string, max = MAX_ITEMS): string[] =>
  String(form.get(name) ?? "")
    .split(/\r?\n|;/)
    .map((v) => v.replace(/\s+/g, " ").trim().slice(0, MAX_LINE))
    .filter(Boolean)
    .slice(0, max);
const checked = (form: Form, name: string, max = MAX_ITEMS): string[] =>
  form.getAll(name).map((v) => String(v).trim().slice(0, 80)).filter(Boolean).slice(0, max);
const oneOf = <T extends string>(form: Form, name: string, allowed: readonly T[], fallback: T): T => {
  const value = String(form.get(name) ?? "");
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
};
const slider = (form: Form, name: string, current: number | undefined): number => {
  const n = Math.round(Number(form.get(name)));
  return n >= 1 && n <= 5 ? n : (current ?? 3);
};

export const DEFAULT_SLIDERS: VoiceSliders = { premium: 3, serious: 3, discreet: 3, institutional: 3, minimal: 3 };

/* ---------------- Écran « L'entreprise » ---------------- */

export function readBusiness(form: Form): BrandBusiness {
  return {
    offer: text(form, "offer"),
    sector: text(form, "sector", 60),
    area: text(form, "area", 80),
    benefits: lines(form, "benefits", 3),
    alternative: text(form, "alternative"),
    objective: text(form, "objective", 60),
  };
}

export function readAudiences(form: Form): BrandAudience[] {
  const audiences: BrandAudience[] = [];
  for (let i = 0; i < MAX_AUDIENCES; i++) {
    const audience = { who: text(form, `a${i}_who`), desire: text(form, `a${i}_desire`), objection: text(form, `a${i}_objection`), proof: text(form, `a${i}_proof`) };
    if (audience.who) audiences.push(audience);
  }
  return audiences;
}

/* ---------------- Écran « La voix » ---------------- */

export function readVoice(form: Form, current: BrandVoice | undefined): BrandVoice & { tone: string[] } {
  const sliders = current?.sliders ?? DEFAULT_SLIDERS;
  return {
    tone: lines(form, "tone", 5),
    says: lines(form, "says", 5),
    never: lines(form, "never", 5),
    sliders: {
      premium: slider(form, "s_premium", sliders.premium),
      serious: slider(form, "s_serious", sliders.serious),
      discreet: slider(form, "s_discreet", sliders.discreet),
      institutional: slider(form, "s_institutional", sliders.institutional),
      minimal: slider(form, "s_minimal", sliders.minimal),
    },
    must: lines(form, "must", 8),
    forbidden: lines(form, "forbidden", 8),
    address: oneOf(form, "address", ["tu", "vous", ""] as const, ""),
    likes: lines(form, "likes", 5),
    dislikes: lines(form, "dislikes", 5),
  };
}

/* ---------------- Écran « Offres, canaux, identité » ---------------- */

export function readOffers(form: Form): BrandOffers {
  const items: BrandOffers["items"] = [];
  for (let i = 0; i < 5; i++) {
    const name = text(form, `o${i}_name`, 80);
    if (name) items.push({ name, line: text(form, `o${i}_line`) });
  }
  return { items, showPrices: oneOf(form, "showPrices", ["oui", "non", "parfois", ""] as const, ""), proofs: lines(form, "proofs"), legal: lines(form, "legal") };
}

export function readPresence(form: Form): BrandPresence {
  return {
    active: checked(form, "active"),
    push: checked(form, "push"),
    formats: checked(form, "formats"),
    frequency: oneOf(form, "frequency", ["light", "steady", "agressif", ""] as const, ""),
  };
}

export function readIdentity(form: Form, current: BrandIdentity | undefined): BrandIdentity {
  return {
    exists: current?.exists ?? "",
    fonts: { display: text(form, "font_display", 60), body: text(form, "font_body", 60) },
    nonNegotiables: lines(form, "nonNegotiables"),
    dated: lines(form, "dated"),
  };
}

export function readVisual(form: Form, current: BrandOS["visual"]): BrandOS["visual"] {
  const palette = lines(form, "palette", 5);
  return {
    palette: palette.length ? palette : current.palette,
    style: text(form, "style") || current.style,
    mood: text(form, "mood") || current.mood,
    avoid: lines(form, "avoid"),
  };
}

/* ---------------- Préparation de la fiche ---------------- */

export type Readiness = { key: string; label: string; ok: boolean; step: number; hint: string };

/** Les blocs verts et rouges de l'écran de validation : ce qui manque pour qu'un associé pitche la marque en 60 s. */
export function readiness(os: BrandOS): Readiness[] {
  const has = (v: string | undefined | null) => Boolean(v && v.trim() && !/à préciser/i.test(v));
  return [
    { key: "positioning", label: "Positionnement et promesse", ok: has(os.positioning) && has(os.promise), step: 4, hint: "Pour qui, quoi, en quoi c’est différent." },
    { key: "business", label: "Offre et bénéfices", ok: has(os.business?.offer) && (os.business?.benefits.length ?? 0) >= 1, step: 4, hint: "Ce qu’elle vend, et les bénéfices qui comptent." },
    { key: "objective", label: "Objectif à 90 jours", ok: has(os.business?.objective), step: 4, hint: "Il priorise les canaux et les formats." },
    { key: "audiences", label: "Au moins un public", ok: (os.audiences?.length ?? 0) >= 1, step: 4, hint: "Sans public, le contenu parle à tout le monde, donc à personne." },
    { key: "tone", label: "Ton et voix", ok: os.tone.length >= 2 && (os.voice?.says.length ?? 0) >= 1, step: 5, hint: "Des adjectifs, et une phrase qu’elle dirait." },
    { key: "limits", label: "Mots imposés ou interdits", ok: (os.voice?.must?.length ?? 0) + (os.voice?.forbidden?.length ?? 0) >= 1, step: 5, hint: "Les garde-fous anti-générique." },
    { key: "visual", label: "Direction visuelle et palette", ok: has(os.visual.style) && os.visual.palette.some((c) => /#[0-9a-f]{6}/i.test(c)), step: 6, hint: "Un style d’image et au moins une couleur codée." },
    { key: "presence", label: "Canaux et formats", ok: (os.presence?.push.length ?? 0) + (os.presence?.formats.length ?? 0) >= 1, step: 6, hint: "Où publier, et quoi savoir sortir." },
  ];
}
