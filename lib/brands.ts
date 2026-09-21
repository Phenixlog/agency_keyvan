import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildBrandOS, isBrandOS, normalizeMega, renderSummary, type BrandOS, type MegaPrompt } from "@/lib/brand-os";
import { applyToBrandOS, applyToMega, describeChanges, touches, type Proposal } from "@/lib/expert/proposal";
import { extractUrl, scrapeUrl } from "@/lib/onboarding";

/**
 * Écritures sur une marque existante. Brand OS et mega-prompt sont versionnés séparément
 * et en ajout seul : on n'écrase jamais une version, on en crée une nouvelle.
 */

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function latestOS(supabase: Supabase, brandId: string) {
  const { data, error } = await supabase
    .from("brand_os_versions")
    .select("version,org_id,summary,canon")
    .eq("brand_id", brandId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function latestMega(supabase: Supabase, brandId: string) {
  const { data, error } = await supabase
    .from("mega_prompts")
    .select("version,org_id,content")
    .eq("brand_id", brandId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertOS(
  supabase: Supabase,
  args: { brandId: string; orgId: string; userId: string; version: number; summary: string; canon: unknown }
) {
  const { error } = await supabase.from("brand_os_versions").insert({
    org_id: args.orgId,
    brand_id: args.brandId,
    version: args.version,
    summary: args.summary,
    canon: args.canon,
    created_by: args.userId,
  });
  if (error) throw error;
}

async function insertMega(
  supabase: Supabase,
  args: { brandId: string; orgId: string; userId: string; previous: MegaPrompt; previousVersion: number; next: Partial<MegaPrompt>; note: string }
) {
  const version = args.previousVersion + 1;
  const content: MegaPrompt = {
    intro: args.next.intro ?? args.previous.intro,
    rules: args.next.rules ?? args.previous.rules,
    changelog: [...(args.previous.changelog ?? []), { v: version, note: args.note, at: new Date().toISOString() }],
  };
  const { error } = await supabase.from("mega_prompts").insert({
    org_id: args.orgId,
    brand_id: args.brandId,
    title: `Mega‑prompt v${version}`,
    content,
    version,
    created_by: args.userId,
  });
  if (error) throw error;
}

/** Le propriétaire corrige le résumé : nouvelle version, canon et mega-prompt inchangés. */
export async function saveBrandSummary(args: { brandId: string; orgId: string; userId: string; summary: string }) {
  const supabase = await createSupabaseServerClient();
  const os = await latestOS(supabase, args.brandId);
  await insertOS(supabase, { ...args, version: (os?.version ?? 0) + 1, canon: os?.canon ?? {} });
}

/** La couleur qui reteinte l'atelier : placée en tête de palette, dans une nouvelle version. */
export async function setBrandColor(args: { brandId: string; orgId: string; userId: string; hex: string }) {
  if (!/^#[0-9a-f]{6}$/i.test(args.hex)) throw new Error("Couleur invalide");
  const supabase = await createSupabaseServerClient();
  const os = await latestOS(supabase, args.brandId);
  if (!os || !isBrandOS(os.canon)) throw new Error("Cette marque n’a pas encore de Brand OS structuré.");
  const hex = args.hex.toUpperCase();
  const canon: BrandOS = {
    ...os.canon,
    visual: { ...os.canon.visual, palette: [hex, ...os.canon.visual.palette.filter((c) => !c.toUpperCase().includes(hex))] },
  };
  await insertOS(supabase, { ...args, version: os.version + 1, summary: os.summary ?? renderSummary(canon), canon });
}

export async function removeRule(args: { brandId: string; orgId: string; userId: string; rule: string }) {
  const supabase = await createSupabaseServerClient();
  const mega = await latestMega(supabase, args.brandId);
  if (!mega) return;
  const previous = normalizeMega(mega.content);
  if (!previous.rules.includes(args.rule)) return;
  await insertMega(supabase, {
    ...args,
    previous,
    previousVersion: mega.version,
    next: { rules: previous.rules.filter((r) => r !== args.rule) },
    note: `Règle retirée : ${args.rule.slice(0, 120)}`,
  });
}

/**
 * Relance l'analyse : relit le site si la marque en a un, ajoute la matière fournie et le résumé
 * déjà validé, puis crée une nouvelle version du Brand OS. Les règles apprises sont conservées.
 */
export async function rebuildBrandOS(args: { brandId: string; orgId: string; userId: string; extra?: string }) {
  const supabase = await createSupabaseServerClient();
  const [{ data: brand }, os, mega] = await Promise.all([
    supabase.from("brands").select("name,data").eq("id", args.brandId).maybeSingle(),
    latestOS(supabase, args.brandId),
    latestMega(supabase, args.brandId),
  ]);
  const seed = ((brand?.data as { seed?: string } | null)?.seed ?? "").trim();
  const url = extractUrl(seed);
  const corpus = url ? await scrapeUrl(url) : "";
  const source = [
    seed,
    corpus,
    args.extra?.trim(),
    os?.summary ? `Résumé actuel, déjà corrigé par le propriétaire de la marque (à respecter) :\n${os.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await buildBrandOS({ source, nameHint: brand?.name ?? null });
  // Never replace the current Brand OS with a deterministic draft: a rebuild is only worth a real analysis.
  if (result.source === "fallback") return "fallback" as const;
  await insertOS(supabase, {
    ...args,
    version: (os?.version ?? 0) + 1,
    summary: renderSummary(result.os),
    canon: { ...result.os, generated_by: result.source },
  });
  await insertMega(supabase, {
    ...args,
    previous: normalizeMega(mega?.content),
    previousVersion: mega?.version ?? 0,
    next: { intro: result.megaIntro },
    note: "Analyse relancée",
  });
  return "llm" as const;
}

/**
 * Applique une proposition de l'expert, déjà validée par parseProposal() : une nouvelle version du
 * Brand OS et/ou du mega-prompt, jamais une réécriture. Le résumé lisible est régénéré depuis la
 * structure pour que les deux ne divergent pas.
 */
export async function applyExpertProposal(args: {
  brandId: string;
  orgId: string;
  userId: string;
  proposal: Proposal;
}): Promise<{ status: "applied"; osVersion: number | null; megaVersion: number | null } | { status: "nothing-to-change" | "no-brand-os" }> {
  const supabase = await createSupabaseServerClient();
  const [os, mega] = await Promise.all([latestOS(supabase, args.brandId), latestMega(supabase, args.brandId)]);
  if (!os || !isBrandOS(os.canon)) return { status: "no-brand-os" };

  const currentMega = normalizeMega(mega?.content);
  if (describeChanges(os.canon, currentMega, args.proposal).length === 0) return { status: "nothing-to-change" };

  const target = touches(args.proposal);
  let osVersion: number | null = null;
  let megaVersion: number | null = null;

  if (target.brandOS) {
    const canon = applyToBrandOS(os.canon, args.proposal);
    const version = os.version + 1;
    osVersion = version;
    await insertOS(supabase, {
      ...args,
      version,
      summary: renderSummary(canon),
      canon: { ...canon, generated_by: "expert", change: args.proposal.title },
    });
  }
  if (target.mega) {
    const next = applyToMega(currentMega, args.proposal);
    megaVersion = (mega?.version ?? 0) + 1;
    await insertMega(supabase, {
      ...args,
      previous: currentMega,
      previousVersion: mega?.version ?? 0,
      next: { intro: next.intro, rules: next.rules },
      note: `Expert : ${args.proposal.title}`,
    });
  }
  return { status: "applied", osVersion, megaVersion };
}
