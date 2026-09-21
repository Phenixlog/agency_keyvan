import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mergeFeedbackIntoRules, normalizeMega, type MegaPrompt } from "@/lib/brand-os";

export async function bumpMegaPrompt(args: {
  brandId: string;
  userId: string;
  feedback: string;
}) {
  const feedback = (args.feedback || "").trim();
  if (!feedback) return;

  const supabase = await createSupabaseServerClient();
  const { data: latest } = await supabase
    .from("mega_prompts")
    .select("version,content,org_id")
    .eq("brand_id", args.brandId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = normalizeMega(latest?.content);
  const nextVersion = (latest?.version || 0) + 1;
  const { rules, note } = await mergeFeedbackIntoRules({ rules: current.rules, feedback });

  const content: MegaPrompt = {
    intro: current.intro,
    rules,
    changelog: [
      ...(current.changelog ?? []),
      { v: nextVersion, note, at: new Date().toISOString() },
    ],
  };
  const { error } = await supabase.from("mega_prompts").insert({
    org_id: latest?.org_id || null,
    brand_id: args.brandId,
    title: `Mega‑prompt v${nextVersion}`,
    content,
    version: nextVersion,
    created_by: args.userId,
  });
  if (error) throw error;
}
