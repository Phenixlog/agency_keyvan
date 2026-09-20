import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function archiveOut(outId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("outs").update({ status: "archived" }).eq("id", outId);
}

