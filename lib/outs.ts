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
};

/** Prefer our Storage copy (stable) over the generator's CDN URL (may expire). */
export function outImageUrl(payload: OutPayload | null | undefined): string | null {
  if (payload?.storage_path) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/outs/${payload.storage_path}`;
  }
  return payload?.image_url || null;
}
