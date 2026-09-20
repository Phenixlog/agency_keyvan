import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function bumpMegaPrompt(args: {
  brandId: string;
  userId: string;
  feedback: string;
}) {
  const supabase = await createSupabaseServerClient();
  // Read latest mega for versioning
  const { data: latest } = await supabase
    .from("mega_prompts")
    .select("version,content,org_id,brand_id")
    .eq("brand_id", args.brandId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version || 1) + 1;
  const content = latest?.content || {};
  const changelogLine =
    (args.feedback || "").trim().slice(0, 200) || "Ajustement NL mineur";
  const newContent = {
    ...content,
    intro:
      (content as any)?.intro
        ? `${(content as any).intro}\n\n[REGLE] ${changelogLine}`
        : `[REGLE] ${changelogLine}`,
    changelog: [
      ...(Array.isArray((content as any)?.changelog)
        ? (content as any).changelog
        : []),
      { v: nextVersion, note: changelogLine, at: new Date().toISOString() },
    ],
  };
  await supabase.from("mega_prompts").insert({
    org_id: latest?.org_id || null,
    brand_id: args.brandId,
    title: `Mega‑prompt v${nextVersion}`,
    content: newContent,
    version: nextVersion,
    created_by: args.userId,
  });
}

