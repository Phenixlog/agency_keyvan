import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function archiveOut(outId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("outs").update({ status: "archived" }).eq("id", outId);
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
