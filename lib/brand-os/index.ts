import { chatJson, isLlmConfigured, MODEL_ANALYSIS, MODEL_FAST } from "@/lib/llm/openrouter";
import {
  ANALYSIS_SYSTEM,
  BRAND_OS_SCHEMA,
  IMAGE_PROMPT_SCHEMA,
  IMAGE_PROMPT_SYSTEM,
  RULES_SCHEMA,
  RULES_SYSTEM,
  analysisUserMessage,
  fallbackBrandOS,
  fallbackImagePrompt,
  fallbackMergeRules,
  imagePromptUserMessage,
  type BrandOS,
  type ImageFormat,
  type MegaPrompt,
} from "@/lib/brand-os/model";

export * from "@/lib/brand-os/model";

export type BrandOSResult = { os: BrandOS; megaIntro: string; source: "llm" | "fallback" };

/** Every LLM step degrades to a deterministic result: generation must never block on the LLM. */
async function withFallback<T>(label: string, run: () => Promise<T>, fallback: () => T): Promise<T> {
  if (!isLlmConfigured()) return fallback();
  try {
    return await run();
  } catch (e) {
    console.error(`[brand-os] ${label} : repli déterministe —`, e instanceof Error ? e.message : e);
    return fallback();
  }
}

export async function buildBrandOS(args: {
  source: string;
  nameHint?: string | null;
}): Promise<BrandOSResult> {
  const toResult = (raw: BrandOS & { mega_intro: string }, source: "llm" | "fallback") => {
    const { mega_intro, ...os } = raw;
    return { os, megaIntro: mega_intro, source };
  };
  return withFallback(
    "analyse de marque",
    async () =>
      toResult(
        await chatJson<BrandOS & { mega_intro: string }>({
          model: MODEL_ANALYSIS,
          system: ANALYSIS_SYSTEM,
          user: analysisUserMessage(args),
          schemaName: "brand_os",
          schema: BRAND_OS_SCHEMA,
          maxTokens: 2500,
        }),
        "llm"
      ),
    () => toResult(fallbackBrandOS(args.source, args.nameHint), "fallback")
  );
}

export async function composeImagePrompt(args: {
  os: BrandOS | null;
  summary: string;
  mega: MegaPrompt;
  brief?: string | null;
  format: ImageFormat;
}): Promise<string> {
  return withFallback(
    "prompt d'image",
    async () => {
      const { prompt } = await chatJson<{ prompt: string }>({
        model: MODEL_FAST,
        system: IMAGE_PROMPT_SYSTEM,
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
    () => fallbackImagePrompt(args)
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
