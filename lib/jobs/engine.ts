import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchTaskResult, hashForFilename, submitImageTask } from "@/lib/wavespeed";
import {
  IMAGE_FORMATS,
  composeImagePrompt,
  isBrandOS,
  normalizeMega,
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
};

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
  const results = await Promise.all(Array.from({ length: count }, () => queueImageGeneration({ ...args, batchId })));
  return { batchId, jobIds: results.map((r) => r.jobId) };
}

export function queueSocialGeneration(args: GenerationArgs) {
  return queueImageGeneration({ ...args, format: "social_square" });
}

export async function queueImageGeneration(
  args: GenerationArgs & { format: ImageFormat }
): Promise<{ jobId: string }> {
  const supabase = await createSupabaseServerClient();
  const format = IMAGE_FORMATS[args.format];
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
  // The image model needs a description of a picture, not brand strategy:
  // an LLM turns Brand OS + learned rules + brief into that description.
  const composedPrompt = await composeImagePrompt({
    os: isBrandOS(os?.canon) ? os.canon : null,
    summary: os?.summary || "",
    mega: normalizeMega(mega?.content),
    brief: args.brief,
    format: args.format,
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
      images: args.referenceUrl ? [args.referenceUrl] : undefined,
    });

    // Poll for result (bounded)
    let outputs: string[] | undefined;
    for (let attempt = 0; attempt < MAX_POLLS[mode === "describe" ? "describe" : "edit"]; attempt++) {
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

    // Insert out (draft)
    const payload = {
      kind: format.kind,
      format: args.format,
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

