import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildSocialPrompt,
  fetchTaskResult,
  hashForFilename,
  submitImageTask,
} from "@/lib/wavespeed";

export type DbJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export async function queueSocialGeneration(args: {
  orgId: string;
  brandId: string;
  userId: string;
  brief?: string | null;
}): Promise<{ jobId: string }> {
  const supabase = await createSupabaseServerClient();

  // Fetch latest OS + Mega
  const [{ data: os }, { data: mega }] = await Promise.all([
    supabase
      .from("brand_os_versions")
      .select("version,summary")
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
  const brandSummary = os?.summary || "";
  const megaIntro = (mega?.content as any)?.intro || "";
  const composedPrompt = buildSocialPrompt({
    megaIntro,
    brandSummary,
    brief: args.brief,
  });

  // Insert job as queued
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      org_id: args.orgId,
      brand_id: args.brandId,
      job_type: "creative_social",
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
      size: "1024*1024",
      output_format: "jpeg",
      seed: -1,
    });

    // Poll for result (bounded)
    let outputs: string[] | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      const res = await fetchTaskResult(taskId);
      const status = (res.data?.status || "").toLowerCase();
      if (status === "completed" || status === "succeeded") {
        outputs = res.data?.outputs || [];
        break;
      }
      if (status === "failed" || status === "canceled") {
        throw new Error(`WaveSpeed statut: ${status}`);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!outputs || outputs.length === 0) {
      throw new Error("Aucune image générée par WaveSpeed.");
    }
    const imageUrl = outputs[0]!;

    // Try to upload into Supabase Storage "outs" (best effort); fallback to keeping external URL
    let storagePath: string | undefined;
    try {
      const path = `brands/${args.brandId}/social-${hashForFilename(
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
    const payload: any = {
      kind: "social_post",
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
        kind: "social_post",
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
  } catch (e: any) {
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

