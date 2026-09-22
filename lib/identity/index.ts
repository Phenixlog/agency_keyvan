import { chatJson, isLlmConfigured, MODEL_ANALYSIS } from "@/lib/llm/openrouter";
import type { BrandOS } from "@/lib/brand-os/model";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchTaskResult, hashForFilename, submitImageTask } from "@/lib/wavespeed";
import {
  DIRECTIONS_SCHEMA,
  DIRECTIONS_SYSTEM,
  MOOD_IMAGES,
  applyDirection,
  directionsUserMessage,
  logoPrompt,
  moodPrompt,
  parseDirections,
  type IdentityDirection,
  type RenderedDirection,
} from "@/lib/identity/model";
import { saveCanonDraft } from "@/lib/onboarding";

export * from "@/lib/identity/model";

const POLL_MS = 1000;
const MAX_POLLS = 120;

/** Three directions written by the analysis model: the art director's proposal before any image. */
export async function writeDirections(args: { os: BrandOS | null; summary: string; brandName: string; ambition?: string | null; references?: string | null }): Promise<IdentityDirection[]> {
  if (!isLlmConfigured()) return [];
  try {
    const raw = await chatJson<unknown>({
      model: MODEL_ANALYSIS,
      system: DIRECTIONS_SYSTEM,
      user: directionsUserMessage(args),
      schemaName: "identity_directions",
      schema: DIRECTIONS_SCHEMA,
      maxTokens: 4000,
      temperature: 0.8,
      timeoutMs: 90_000,
    });
    return parseDirections(raw);
  } catch (e) {
    console.error("[identity] directions —", e instanceof Error ? e.message : e);
    return [];
  }
}

/** One picture, generated and copied to Storage under the brand's identity folder. Null on failure: a missing moodboard picture must not sink the direction. */
async function renderImage(brandId: string, name: string, prompt: string, aspectRatio = "1:1"): Promise<string | null> {
  try {
    const taskId = await submitImageTask({ prompt, aspectRatio, resolution: "1k" });
    let url: string | null = null;
    for (let i = 0; i < MAX_POLLS && !url; i++) {
      const res = await fetchTaskResult(taskId);
      const status = (res.data?.status || "").toLowerCase();
      if (status === "completed" || status === "succeeded") url = res.data?.outputs?.[0] ?? null;
      else if (status === "failed" || status === "canceled") throw new Error(`WaveSpeed ${status}`);
      else await new Promise((r) => setTimeout(r, POLL_MS));
    }
    if (!url) throw new Error("délai dépassé");
    const supabase = await createSupabaseServerClient();
    const path = `brands/${brandId}/identity/${name}-${hashForFilename(`${prompt}-${Date.now()}`)}.png`;
    const bytes = new Uint8Array(await (await fetch(url, { cache: "no-store" })).arrayBuffer());
    const upload = await supabase.storage.from("outs").upload(path, bytes, { contentType: "image/png", upsert: false });
    return upload.data?.path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/outs/${upload.data.path}` : url;
  } catch (e) {
    console.error(`[identity] image ${name} —`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Every direction gets its logo and its moodboard pictures, all in parallel (≈ 40-60 s, ≈ 22 centimes for three). */
export async function renderDirections(args: { brandId: string; brandName: string; os: BrandOS | null; directions: IdentityDirection[] }): Promise<RenderedDirection[]> {
  return Promise.all(
    args.directions.map(async (direction, index) => {
      const [logo, ...mood] = await Promise.all([
        renderImage(args.brandId, `logo-${index}`, logoPrompt(direction, args.brandName, "light")),
        ...Array.from({ length: MOOD_IMAGES }, (_, i) => renderImage(args.brandId, `mood-${index}-${i}`, moodPrompt(direction, args.os, i), "4:5")),
      ]);
      return { ...direction, images: { logo, mood: mood.filter((m): m is string => Boolean(m)) } };
    })
  );
}

/**
 * The human choice: the direction becomes the brand (palette, fonts, graphic system, logo), and the
 * base assets are drawn — logo on dark, avatar monogram. Guidelines are the board itself.
 */
export async function chooseDirection(args: { brandId: string; brandName: string; direction: RenderedDirection }): Promise<void> {
  const [dark, avatar] = await Promise.all([
    renderImage(args.brandId, "logo-dark", logoPrompt(args.direction, args.brandName, "dark")),
    renderImage(args.brandId, "avatar", logoPrompt(args.direction, args.brandName, "avatar")),
  ]);
  await saveCanonDraft(args.brandId, (os) => applyDirection(os, args.direction));
  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase.from("brands").select("data").eq("id", args.brandId).maybeSingle();
  const data = {
    ...((brand?.data as Record<string, unknown> | null) ?? {}),
    ...(args.direction.images.logo ? { logo: { path: null, url: args.direction.images.logo, generated: true } } : {}),
    identity: {
      direction: args.direction.name,
      chosenAt: new Date().toISOString(),
      assets: [
        args.direction.images.logo ? { kind: "logo", label: "Logo sur fond clair", url: args.direction.images.logo } : null,
        dark ? { kind: "logo_dark", label: "Logo sur fond sombre", url: dark } : null,
        avatar ? { kind: "avatar", label: "Avatar réseaux", url: avatar } : null,
        ...args.direction.images.mood.map((url, i) => ({ kind: "mood", label: `Moodboard ${i + 1}`, url })),
      ].filter(Boolean),
    },
  };
  const { error } = await supabase.from("brands").update({ data }).eq("id", args.brandId);
  if (error) throw error;
}
