import { chatJson, isLlmConfigured, MODEL_FAST } from "@/lib/llm/openrouter";
import type { BrandOS } from "@/lib/brand-os/model";
import { TEXT_CHECK_SCHEMA, TEXT_CHECK_SYSTEM, TILE_COPY_SCHEMA, TILE_COPY_SYSTEM, compareTexts, fallbackTilePlan, parseTilePlan, tileCopyUserMessage, type TextCheck, type TileCopy, type TileKind, type TilePlan } from "@/lib/tiles/model";

export * from "@/lib/tiles/model";

/** The tile's words, in the brand's voice — shown to the user before any image is paid for. */
export async function planTile(args: { os: BrandOS | null; summary: string; kind: TileKind; brief: string; formatLabel: string }): Promise<{ plan: TilePlan; source: "llm" | "fallback" }> {
  if (!isLlmConfigured()) return { plan: fallbackTilePlan(args.brief), source: "fallback" };
  try {
    const raw = await chatJson<unknown>({
      model: MODEL_FAST,
      system: TILE_COPY_SYSTEM,
      user: tileCopyUserMessage(args),
      schemaName: "tile_copy",
      schema: TILE_COPY_SCHEMA,
      maxTokens: 500,
      temperature: 0.7,
      timeoutMs: 25_000,
    });
    const plan = parseTilePlan(raw);
    if (!plan) throw new Error("plan illisible");
    return { plan, source: "llm" };
  } catch (e) {
    console.error("[tiles] rédaction : repli —", e instanceof Error ? e.message : e);
    return { plan: fallbackTilePlan(args.brief), source: "fallback" };
  }
}

/**
 * Reads the generated image back and compares with what was asked: a typo in a client's post is
 * unacceptable, and the image model does make some. Never blocks: on failure the check is "unknown".
 */
export async function checkTileText(imageUrl: string, copy: TileCopy): Promise<TextCheck | null> {
  if (!isLlmConfigured()) return null;
  try {
    const { found } = await chatJson<{ found: string[] }>({
      model: MODEL_FAST,
      system: TEXT_CHECK_SYSTEM,
      user: "Transcribe every readable text in this image.",
      imageUrls: [imageUrl],
      schemaName: "text_check",
      schema: TEXT_CHECK_SCHEMA,
      maxTokens: 400,
      temperature: 0,
      timeoutMs: 25_000,
    });
    return compareTexts(copy, Array.isArray(found) ? found.map(String) : []);
  } catch (e) {
    console.error("[tiles] contrôle du texte impossible —", e instanceof Error ? e.message : e);
    return null;
  }
}
