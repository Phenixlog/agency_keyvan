import { chatJson, isLlmConfigured, MODEL_ANALYSIS, MODEL_FAST } from "@/lib/llm/openrouter";
import type { BrandOS } from "@/lib/brand-os/model";
import {
  CAROUSEL_MIN,
  CAROUSEL_PLAN_SCHEMA,
  CAROUSEL_PLAN_SYSTEM,
  FEED_PLAN_SCHEMA,
  FEED_PLAN_SYSTEM,
  FEED_SIZE,
  TEXT_CHECK_SCHEMA,
  TEXT_CHECK_SYSTEM,
  TILE_COPY_SCHEMA,
  TILE_COPY_SYSTEM,
  carouselUserMessage,
  compareTexts,
  fallbackTilePlan,
  feedUserMessage,
  parseCarouselPlan,
  parseFeedPlan,
  parseTilePlan,
  tileCopyUserMessage,
  type PlannedTile,
  type Surface,
  type TextCheck,
  type TileCopy,
  type TileKind,
  type TilePlan,
} from "@/lib/tiles/model";

export * from "@/lib/tiles/model";

/** The tile's words, in the brand's voice — shown to the user before any image is paid for. */
export async function planTile(args: { os: BrandOS | null; summary: string; kind: TileKind; brief: string; formatLabel: string; surface?: Surface; headline?: string }): Promise<{ plan: TilePlan; source: "llm" | "fallback" }> {
  const keep = (plan: TilePlan): TilePlan => (args.headline ? { ...plan, headline: args.headline } : plan);
  if (!isLlmConfigured()) return { plan: keep(fallbackTilePlan(args.brief)), source: "fallback" };
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
    return { plan: keep(plan), source: "llm" };
  } catch (e) {
    console.error("[tiles] rédaction : repli —", e instanceof Error ? e.message : e);
    return { plan: keep(fallbackTilePlan(args.brief)), source: "fallback" };
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

/** Nine tiles that read as one feed, planned by the analysis model (it must hold the whole brand in view). */
export async function planFeed(args: { os: BrandOS | null; summary: string; theme: string; formatLabel: string }): Promise<{ tiles: PlannedTile[]; source: "llm" | "fallback" }> {
  if (!isLlmConfigured()) return { tiles: [], source: "fallback" };
  try {
    const raw = await chatJson<unknown>({ model: MODEL_ANALYSIS, system: FEED_PLAN_SYSTEM, user: feedUserMessage(args), schemaName: "feed_plan", schema: FEED_PLAN_SCHEMA, maxTokens: 3500, temperature: 0.7, timeoutMs: 90_000 });
    const tiles = parseFeedPlan(raw);
    if (tiles.length < FEED_SIZE) throw new Error(`${tiles.length} tuiles sur ${FEED_SIZE}`);
    return { tiles, source: "llm" };
  } catch (e) {
    console.error("[tiles] plan du feed —", e instanceof Error ? e.message : e);
    return { tiles: [], source: "fallback" };
  }
}

export async function planCarousel(args: { os: BrandOS | null; summary: string; subject: string; slides: number; formatLabel: string }): Promise<{ slides: TilePlan[]; source: "llm" | "fallback" }> {
  if (!isLlmConfigured()) return { slides: [], source: "fallback" };
  try {
    const raw = await chatJson<unknown>({ model: MODEL_FAST, system: CAROUSEL_PLAN_SYSTEM, user: carouselUserMessage(args), schemaName: "carousel_plan", schema: CAROUSEL_PLAN_SCHEMA, maxTokens: 1500, temperature: 0.7, timeoutMs: 40_000 });
    const slides = parseCarouselPlan(raw, args.slides);
    if (slides.length < CAROUSEL_MIN) throw new Error("trop peu de diapositives");
    return { slides, source: "llm" };
  } catch (e) {
    console.error("[tiles] plan du carrousel —", e instanceof Error ? e.message : e);
    return { slides: [], source: "fallback" };
  }
}
