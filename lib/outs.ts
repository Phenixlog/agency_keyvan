import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OutStatus = "draft" | "ready" | "archived";

/** RLS limits the update to outs of the caller's organisations. */
export async function setOutStatus(outId: string, status: OutStatus) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("outs").update({ status }).eq("id", outId);
  if (error) throw error;
}


export type OutPayload = {
  image_url?: string | null;
  storage_path?: string | null;
  brief?: string | null;
  format?: string | null;
  format_label?: string | null;
  aspect_ratio?: string | null;
  prompt?: string | null;
  mode?: "describe" | "restage" | "retouch" | null;
  subject?: string | null;
  instruction?: string | null;
  reference_url?: string | null;
  parent_out_id?: string | null;
  batch_id?: string | null;
  tile?: { kind: string; background: string; copy: { headline: string; subline: string; caption: string; cta: string; items?: string[] }; logo: boolean } | null;
  text_check?: { ok: boolean; expected: string[]; found: string[]; issues: string[] } | null;
  feed_index?: number | null;
  carousel?: { index: number; total: number } | null;
  /** One face of a business card: which one, and which pair of the lot it belongs to (1-based). */
  card?: { face: "front" | "back"; pair: number } | null;
};

/** Subject given to the editing model when the reference is one of our own creations ("Mettre en situation"). */
export const CREATION_AS_REFERENCE = "the design shown in the reference image, reproduced faithfully and undistorted on the medium";

/** A creation placed on a medium (T-shirt worn, shop window…), as opposed to a product photo from the library. */
export function isStagedCreation(payload: OutPayload | null | undefined): boolean {
  return payload?.mode === "restage" && (Boolean(payload.parent_out_id) || payload.subject === CREATION_AS_REFERENCE);
}

/** Prefer our Storage copy (stable) over the generator's CDN URL (may expire). */
export function outImageUrl(payload: OutPayload | null | undefined): string | null {
  if (payload?.storage_path) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/outs/${payload.storage_path}`;
  }
  return payload?.image_url || null;
}
