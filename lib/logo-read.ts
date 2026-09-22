import { chatJson, isLlmConfigured, MODEL_FAST } from "@/lib/llm/openrouter";

/**
 * What a logo says about a brand, read by a vision model: its colours, the kind of type it uses and
 * the mood it sets. For a brand that has nothing but a logo (Lusitano, Ajaccio: cream, black, a gold
 * bean), this is the whole visual identity — the analysis must see it, not just be told "a logo exists".
 */
export type LogoReading = { colors: { name: string; hex: string }[]; typography: string; style: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["colors", "typography", "style"],
  properties: {
    colors: {
      type: "array",
      description: "Every colour actually used in the logo, background included if it is part of it, 2 to 5, most important first. hex as #RRGGBB.",
      items: { type: "object", additionalProperties: false, required: ["name", "hex"], properties: { name: { type: "string", description: "Nom de la couleur en français (« crème », « noir », « or »)" }, hex: { type: "string" } } },
    },
    typography: { type: "string", description: "En français, 1 phrase : la famille typographique du logo (sérif fin à empattements, sans géométrique gras, script…), sa casse, son espacement." },
    style: { type: "string", description: "En français, 1 à 2 phrases : le style et l'ambiance que le logo impose (minimaliste, premium, artisanal, ludique…), et le symbole s'il y en a un." },
  },
} as const;

export async function readLogo(url: string): Promise<LogoReading | null> {
  if (!isLlmConfigured()) return null;
  try {
    const raw = await chatJson<LogoReading>({
      model: MODEL_FAST,
      system: "You describe a brand logo for a brand strategist: exact colours, type family, mood. Output only what is visible. Answer in French.",
      user: "Décris ce logo : couleurs exactes (codes hex), typographie, style.",
      imageUrls: [url],
      schemaName: "logo_reading",
      schema: SCHEMA,
      maxTokens: 400,
      temperature: 0.2,
      timeoutMs: 25_000,
    });
    const colors = (raw.colors ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex ?? "")).slice(0, 5).map((c) => ({ name: String(c.name ?? "").trim().slice(0, 30), hex: c.hex.toUpperCase() }));
    return { colors, typography: String(raw.typography ?? "").slice(0, 300), style: String(raw.style ?? "").slice(0, 400) };
  } catch (e) {
    console.error("[logo] lecture impossible —", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The reading, said to the analysis the way the site colours are: facts to keep, not to reinvent. */
export function logoDeclaration(reading: LogoReading | null): string {
  if (!reading) return "";
  const lines = [
    reading.colors.length ? `Couleurs du logo (lues sur l'image) : ${reading.colors.map((c) => `${c.name} ${c.hex}`).join(", ")}. La palette DOIT reprendre ces codes tels quels (nomme-les) et ne peut ajouter au plus qu'une couleur d'accent cohérente.` : "",
    reading.typography ? `Typographie du logo : ${reading.typography} Les polices de la marque doivent s'en rapprocher.` : "",
    reading.style ? `Ce que le logo impose : ${reading.style}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
