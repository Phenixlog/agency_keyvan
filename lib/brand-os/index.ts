import { chatJson, isLlmConfigured, MODEL_ANALYSIS, MODEL_FAST } from "@/lib/llm/openrouter";
import {
  ANALYSIS_SYSTEM,
  EDIT_PROMPT_SYSTEM,
  BRAND_OS_EXTENSION_SCHEMA,
  BRAND_OS_SCHEMA,
  IMAGE_PROMPT_SCHEMA,
  IMAGE_PROMPT_SYSTEM,
  RULES_SCHEMA,
  RULES_SYSTEM,
  alignGraphicToPalette,
  analysisUserMessage,
  fallbackBrandOS,
  fallbackEditPrompt,
  fallbackImagePrompt,
  fallbackMergeRules,
  imagePromptUserMessage,
  type BrandOS,
  type ImageFormat,
  type ImageMode,
  type MegaPrompt,
} from "@/lib/brand-os/model";

export * from "@/lib/brand-os/model";

export type BrandOSResult = { os: BrandOS; megaIntro: string; source: "llm" | "fallback"; /** Why the core analysis fell back, raw, for the screen to translate. */ failure?: string | null };

/** Every LLM step degrades to a deterministic result: generation must never block on the LLM. */
async function withFallback<T>(label: string, run: () => Promise<T>, fallback: () => T, notes?: string[]): Promise<T> {
  if (!isLlmConfigured()) {
    notes?.push("OPENROUTER_API_KEY manquante");
    return fallback();
  }
  try {
    return await run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[brand-os] ${label} : repli déterministe —`, message);
    notes?.push(message);
    return fallback();
  }
}

type Extension = Pick<BrandOS, "business" | "audiences" | "offers" | "presence" | "graphic"> & { voice: Omit<NonNullable<BrandOS["voice"]>, "says" | "never"> };

export async function buildBrandOS(args: {
  source: string;
  nameHint?: string | null;
  declared?: string | null;
}): Promise<BrandOSResult> {
  const toResult = (raw: BrandOS & { mega_intro: string }, source: "llm" | "fallback") => {
    const { mega_intro, ...os } = raw;
    return { os, megaIntro: mega_intro, source };
  };
  const user = analysisUserMessage(args);
  const notes: string[] = [];
  // The core (positioning, voice, visual) and the questionnaire blocks are asked in parallel:
  // one strict schema for everything is too large for the provider. A failed extension only
  // leaves its blocks empty; a failed core falls back to the deterministic draft.
  const extension = isLlmConfigured()
    ? chatJson<Extension>({ model: MODEL_ANALYSIS, system: ANALYSIS_SYSTEM, user, schemaName: "brand_os_extension", schema: BRAND_OS_EXTENSION_SCHEMA, maxTokens: 3500, timeoutMs: 90_000 }).catch((e) => {
        console.error("[brand-os] blocs du questionnaire : vides —", e instanceof Error ? e.message : e);
        return null;
      })
    : Promise.resolve(null);
  const result = await withFallback(
    "analyse de marque",
    async () =>
      toResult(
        await chatJson<BrandOS & { mega_intro: string }>({
          model: MODEL_ANALYSIS,
          system: ANALYSIS_SYSTEM,
          user,
          schemaName: "brand_os",
          schema: BRAND_OS_SCHEMA,
          maxTokens: 2500,
          timeoutMs: 90_000,
        }),
        "llm"
      ),
    () => toResult(fallbackBrandOS(args.source, args.nameHint), "fallback"),
    notes
  );
  const extra = await extension;
  if (!extra) return { ...result, failure: notes[0] ?? null };
  const { voice: voiceExtra, ...blocks } = extra;
  const graphic = blocks.graphic ? alignGraphicToPalette(blocks.graphic, result.os.visual.palette) : undefined;
  return { ...result, failure: notes[0] ?? null, os: { ...result.os, ...blocks, ...(graphic ? { graphic } : {}), voice: { says: [], never: [], ...result.os.voice, ...voiceExtra } } };
}

export async function composeImagePrompt(args: {
  os: BrandOS | null;
  summary: string;
  mega: MegaPrompt;
  brief?: string | null;
  format: ImageFormat;
  direction?: string;
  mode?: ImageMode;
  subject?: string | null;
  instruction?: string | null;
  /** The brand's real logo travels as a reference image: the prompt must say so, and never invent one. */
  logo?: boolean;
}): Promise<string> {
  const mode = args.mode ?? "describe";
  return withFallback(
    mode === "describe" ? "prompt d'image" : `instruction d'édition (${mode})`,
    async () => {
      const { prompt } = await chatJson<{ prompt: string }>({
        model: MODEL_FAST,
        system: mode === "describe" ? IMAGE_PROMPT_SYSTEM : EDIT_PROMPT_SYSTEM[mode],
        user: imagePromptUserMessage(args),
        schemaName: "image_prompt",
        schema: IMAGE_PROMPT_SCHEMA,
        maxTokens: 400,
        temperature: 0.7,
        timeoutMs: 20_000,
      });
      if (!prompt?.trim()) throw new Error("prompt vide");
      return prompt.trim();
    },
    () => (mode === "describe" ? fallbackImagePrompt(args) : fallbackEditPrompt({ ...args, mode }))
  );
}

export async function mergeFeedbackIntoRules(args: {
  rules: string[];
  feedback: string;
}): Promise<{ rules: string[]; note: string }> {
  return withFallback(
    "intégration du feedback",
    () =>
      chatJson<{ rules: string[]; note: string }>({
        model: MODEL_FAST,
        system: RULES_SYSTEM,
        user: `Règles actuelles :\n- ${args.rules.join("\n- ") || "(aucune)"}\n\nNouveau feedback : """${args.feedback.trim()}"""`,
        schemaName: "rules",
        schema: RULES_SCHEMA,
        maxTokens: 800,
        timeoutMs: 20_000,
      }),
    () => fallbackMergeRules(args.rules, args.feedback)
  );
}
