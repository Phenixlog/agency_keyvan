import { createSupabaseServerClient } from "@/lib/supabase/server";
import { acceptedChoices, getMediumBrief, guidanceWithAnswers } from "@/lib/expertise";
import { checkTileText, tilePrompt, type Background, type TileKind, type TilePlan } from "@/lib/tiles";
import { fallbackGraphic } from "@/lib/brand-os/model";
import { fetchTaskResult, hashForFilename, submitImageTask } from "@/lib/wavespeed";
import {
  composeImagePrompt,
  isBrandOS,
  normalizeMega,
  resolveFormat,
  type CustomFormat,
  type ImageFormat,
  type ImageMode,
} from "@/lib/brand-os";

export type DbJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

type GenerationArgs = {
  orgId: string;
  brandId: string;
  userId: string;
  brief?: string | null;
  /** describe (default): from words · restage: the client's real product in a new scene · retouch: one change on a creation. */
  mode?: ImageMode;
  /** Public URL of the reference photo (restage) or of the creation to fix (retouch). */
  referenceUrl?: string | null;
  /** What the reference shows, in the owner's words ("tasse Lune ivoire"). */
  subject?: string | null;
  /** The change asked for when retouching. */
  instruction?: string | null;
  /** Creations made from the same click share a batch id: they are proposals of one brief. */
  batchId?: string | null;
  parentOutId?: string | null;
  /** Ratio and medium when `format` is "custom". */
  custom?: CustomFormat | null;
  /** The user's picks among the questions of the medium's expertise brief. */
  answers?: Record<string, string>;
  /** Medium guidance already resolved by the caller (the three proposals of a brief share one). */
  mediumGuidance?: string;
  /** A tile with text: the words (already approved by the user), the kind of tile and which background to use. */
  tile?: { kind: TileKind; plan: TilePlan; background: Background } | null;
  /** The brand's real logo, sent as a reference so the image model reproduces it instead of inventing one. */
  logoUrl?: string | null;
  /** Position in a feed of nine (0-based, Instagram reading order). */
  feedIndex?: number | null;
  /** Slide of a carousel: its position (1-based) and the total. */
  carousel?: { index: number; total: number } | null;
};

const BACKGROUND_ROTATION: Background[] = ["brand", "light", "dark"];

const POLL_INTERVAL_MS = 800;
// GPT Image takes 20-60 s per picture, more at 4k or when editing from a reference.
const MAX_POLLS: Record<"describe" | "edit", number> = { describe: 150, edit: 225 };
export const PROPOSALS_PER_BRIEF = 3;

/**
 * Several proposals for one brief, generated in parallel: each gets its own LLM-written prompt,
 * so they differ in idea and not only in noise. One failure does not cancel the others.
 */
export async function queueProposals(args: GenerationArgs & { format: ImageFormat }, count = PROPOSALS_PER_BRIEF) {
  const batchId = crypto.randomUUID();
  const mediumGuidance = await resolveMediumGuidance(args);
  // Tiles with text: the three proposals show the three faces of the graphic system (brand / light / dark).
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      queueImageGeneration({ ...args, batchId, mediumGuidance, tile: args.tile ? { ...args.tile, background: BACKGROUND_ROTATION[i % BACKGROUND_ROTATION.length] } : null })
    )
  );
  return { batchId, jobIds: results.map((r) => r.jobId) };
}

/** What a specialist of this medium knows, plus the user's choices: replaces the catalogue's one-liner. */
async function resolveMediumGuidance(args: GenerationArgs & { format: ImageFormat }): Promise<string> {
  if (args.mediumGuidance) return args.mediumGuidance;
  const { brief } = await getMediumBrief({ orgId: args.orgId, userId: args.userId, format: args.format, custom: args.custom });
  const answers = args.answers ?? {};
  const given = Object.keys(answers).length;
  const kept = acceptedChoices(brief, answers).length;
  // Answers are only valid against the brief the user saw. Losing some means the brief changed in between: worth knowing.
  if (kept < given) console.warn(`[expertise] ${given - kept} réponse(s) sur ${given} ignorée(s) : absentes de la fiche « ${args.format} » en vigueur.`);
  return guidanceWithAnswers(brief, answers);
}

/** A feed of nine tiles (or a carousel's slides): one batch, every tile already planned, all in parallel. */
export async function queueSeries(args: GenerationArgs & { format: ImageFormat }, tiles: { kind: TileKind; plan: TilePlan; background: Background }[], series: "feed" | "carousel") {
  const batchId = crypto.randomUUID();
  const mediumGuidance = await resolveMediumGuidance(args);
  const results = await Promise.all(
    tiles.map((tile, i) =>
      queueImageGeneration({
        ...args,
        batchId,
        mediumGuidance,
        tile,
        brief: tile.plan.headline,
        feedIndex: series === "feed" ? i : null,
        carousel: series === "carousel" ? { index: i + 1, total: tiles.length } : null,
      })
    )
  );
  return { batchId, jobIds: results.map((r) => r.jobId) };
}

export function queueSocialGeneration(args: GenerationArgs) {
  return queueImageGeneration({ ...args, format: "social_square" });
}

export async function queueImageGeneration(
  args: GenerationArgs & { format: ImageFormat }
): Promise<{ jobId: string }> {
  const supabase = await createSupabaseServerClient();
  const format = resolveFormat(args.format, args.custom);
  const mediumGuidance = await resolveMediumGuidance(args);
  // The logo is a reference image too, but the semantics stay "describe": the picture is drawn, the logo is placed on it.
  const withLogo = Boolean(args.tile && args.logoUrl && !args.referenceUrl);
  const mode: ImageMode = args.referenceUrl ? (args.mode === "retouch" ? "retouch" : "restage") : "describe";

  // Fetch latest OS + Mega
  const [{ data: os }, { data: mega }] = await Promise.all([
    supabase
      .from("brand_os_versions")
      .select("version,summary,canon")
      .eq("brand_id", args.brandId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("mega_prompts")
      .select("version,content")
      .eq("brand_id", args.brandId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const canon = isBrandOS(os?.canon) ? os.canon : null;
  // A tile with text is assembled by code so the words reach the image model untouched;
  // a picture without text is described by an LLM from Brand OS + learned rules + brief.
  const composedPrompt = args.tile && mode === "describe"
    ? tilePrompt({
        plan: args.tile.plan,
        kind: args.tile.kind,
        background: args.tile.background,
        graphic: canon?.graphic ?? fallbackGraphic(canon),
        os: canon,
        aspectRatio: format.aspectRatio,
        hasLogo: withLogo,
        brandName: canon?.name ?? "the brand",
        direction: mediumGuidance,
        slide: args.carousel ?? null,
      })
    : await composeImagePrompt({
    os: isBrandOS(os?.canon) ? os.canon : null,
    summary: os?.summary || "",
    mega: normalizeMega(mega?.content),
    brief: args.brief,
    format: format.key,
    direction: mediumGuidance,
    mode,
    subject: args.subject,
    instruction: args.instruction,
  });

  // Insert job as queued
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      org_id: args.orgId,
      brand_id: args.brandId,
      job_type: format.kind === "print" ? "creative_print" : "creative_social",
      prompt: composedPrompt,
      status: "queued",
      created_by: args.userId,
    })
    .select("id")
    .single();
  if (jobErr) throw jobErr;
  const jobId = job!.id as string;

  // Process synchronously: update status to running, call WaveSpeed, save out, finalize job.
  try {
    await supabase
      .from("jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);

    // Submit image generation task
    const taskId = await submitImageTask({
      prompt: composedPrompt,
      aspectRatio: format.aspectRatio,
      resolution: format.resolution,
      images: args.referenceUrl ? [args.referenceUrl] : withLogo ? [args.logoUrl!] : undefined,
    });

    // Poll for result (bounded)
    let outputs: string[] | undefined;
    for (let attempt = 0; attempt < MAX_POLLS[mode === "describe" && !withLogo ? "describe" : "edit"]; attempt++) {
      const res = await fetchTaskResult(taskId);
      const status = (res.data?.status || "").toLowerCase();
      if (status === "completed" || status === "succeeded") {
        outputs = res.data?.outputs || [];
        break;
      }
      if (status === "failed" || status === "canceled") {
        throw new Error(`WaveSpeed statut: ${status}`);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    if (!outputs || outputs.length === 0) {
      throw new Error("Aucune image générée par WaveSpeed.");
    }
    const imageUrl = outputs[0]!;

    // Try to upload into Supabase Storage "outs" (best effort); fallback to keeping external URL
    let storagePath: string | undefined;
    try {
      const path = `brands/${args.brandId}/${args.format}-${hashForFilename(
        `${jobId}-${Date.now()}`
      )}.jpg`;
      const imgRes = await fetch(imageUrl, { cache: "no-store" });
      const arrayBuffer = await imgRes.arrayBuffer();
      const upload = await supabase.storage
        .from("outs")
        .upload(path, new Uint8Array(arrayBuffer), {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (upload?.data?.path) {
        storagePath = upload.data.path;
      }
    } catch {
      // Ignore storage failures; we'll persist external URL
    }

    // A tile with text: read the image back and compare with the words asked for (typos happen).
    const textCheck = args.tile ? await checkTileText(imageUrl, args.tile.plan) : null;

    // Insert out (draft)
    const payload = {
      kind: format.kind,
      format: format.key,
      // Kept with the image so it can be labelled and retouched later, even for a custom format.
      format_label: format.label,
      aspect_ratio: format.aspectRatio,
      brief: args.brief?.trim() || null,
      // Where this image comes from: shown in the Studio ("d'où vient cette image").
      mode,
      subject: args.subject?.trim() || null,
      instruction: args.instruction?.trim() || null,
      reference_url: args.referenceUrl ?? null,
      parent_out_id: args.parentOutId ?? null,
      batch_id: args.batchId ?? null,
      image_url: imageUrl,
      storage_path: storagePath || null,
      prompt: composedPrompt,
      job_id: jobId,
      // Tile with text: the words drawn, the background used, and whether the model spelled them right.
      tile: args.tile ? { kind: args.tile.kind, background: args.tile.background, copy: { headline: args.tile.plan.headline, subline: args.tile.plan.subline, caption: args.tile.plan.caption, cta: args.tile.plan.cta }, logo: withLogo } : null,
      text_check: textCheck,
      feed_index: args.feedIndex ?? null,
      carousel: args.carousel ?? null,
    };
    const { data: out, error: outErr } = await supabase
      .from("outs")
      .insert({
        org_id: args.orgId,
        brand_id: args.brandId,
        kind: format.kind,
        payload,
        status: "draft",
        created_by: args.userId,
      })
      .select("id,payload")
      .single();
    if (outErr) throw outErr;

    // Finalize job
    await supabase
      .from("jobs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        output: { out_id: out!.id, image_url: imageUrl, storage_path: storagePath || null },
      })
      .eq("id", jobId);
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Erreur inconnue";
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", jobId);
  }

  return { jobId };
}

export async function getJob(jobId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id,job_type,prompt,status,output,error,created_at,updated_at,started_at,finished_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

