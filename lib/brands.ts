import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildBrandOS, isBrandOS, normalizeMega, renderSummary, type BrandOS, type MegaPrompt } from "@/lib/brand-os";
import { randomBytes } from "node:crypto";
import { isForbidden, isMissingColumn, isMissingTable } from "@/lib/db-errors";
import { applyToBrandOS, applyToMega, describeChanges, touches, type Proposal } from "@/lib/expert/proposal";
import { extractUrl, saveBrandSource, scrapeSite } from "@/lib/onboarding";

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
  let corpus = "";
  let siteColors: string[] = ((brand?.data as { site?: { colors?: string[] } } | null)?.site?.colors ?? []).filter((c) => /^#[0-9A-F]{6}$/.test(c));
  if (url) {
    const site = await scrapeSite(url);
    corpus = site.text;
    // A re-analysis also refreshes the logo, the share image and the colours read in the site's CSS.
    if (corpus) {
      await saveBrandSource(args.brandId, { url, assets: site.assets, readChars: corpus.length });
      siteColors = site.assets.colors ?? siteColors;
    }
  }
  const source = [
    seed,
    corpus,
    args.extra?.trim(),
    os?.summary ? `Résumé actuel, déjà corrigé par le propriétaire de la marque (à respecter) :\n${os.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await buildBrandOS({
    source,
    nameHint: brand?.name ?? null,
    declared: siteColors.length ? `Couleurs réellement utilisées par le site (lues dans son CSS, par fréquence) : ${siteColors.join(", ")}. La palette DOIT reprendre ces codes tels quels (nomme-les), sans en inventer d'autres.` : null,
  });
  // Never replace the current Brand OS with a deterministic draft: a rebuild is only worth a real analysis.
  if (result.source === "fallback") return "fallback" as const;
  // An identity created and chosen with Brand OS (door B) is a decision, not an analysis: a re-analysis keeps it.
  const chosenIdentity = Boolean((brand?.data as { identity?: unknown } | null)?.identity);
  const current = isBrandOS(os?.canon) ? os.canon : null;
  if (chosenIdentity && current) {
    result.os.visual = { ...result.os.visual, palette: current.visual.palette, style: current.visual.style, mood: current.visual.mood };
    if (current.graphic) result.os.graphic = current.graphic;
    if (current.identity) result.os.identity = { ...result.os.identity, ...current.identity };
  }
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

const MAX_BRAND_NAME = 80;

/** RLS limits both writes to brands of the caller's organisations. */
export async function renameBrand(brandId: string, name: string): Promise<"ok" | "invalid"> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, MAX_BRAND_NAME);
  if (!clean) return "invalid";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("brands").update({ name: clean }).eq("id", brandId);
  if (error) throw error;
  return "ok";
}

/** Archiving hides a client from the workshop and keeps everything; nothing is ever deleted. */
export async function setBrandArchived(brandId: string, archived: boolean): Promise<"ok" | "migration-needed"> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("brands")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", brandId);
  if (isMissingColumn(error)) return "migration-needed";
  if (error) throw error;
  return "ok";
}

/**
 * Revenir en arrière sans rien effacer : la version choisie est recopiée comme NOUVELLE version,
 * l'historique reste intact (et on peut donc annuler une restauration).
 */
export async function restoreBrandOSVersion(args: { brandId: string; orgId: string; userId: string; version: number }): Promise<"ok" | "not-found"> {
  const supabase = await createSupabaseServerClient();
  const [{ data: source }, latest] = await Promise.all([
    supabase.from("brand_os_versions").select("summary,canon").eq("brand_id", args.brandId).eq("version", args.version).maybeSingle(),
    latestOS(supabase, args.brandId),
  ]);
  if (!source || !latest) return "not-found";
  await insertOS(supabase, {
    ...args,
    version: latest.version + 1,
    summary: source.summary ?? "",
    canon: { ...(source.canon as Record<string, unknown>), generated_by: "restore", change: `Retour à la v${args.version}` },
  });
  return "ok";
}

export async function restoreMegaVersion(args: { brandId: string; orgId: string; userId: string; version: number }): Promise<"ok" | "not-found"> {
  const supabase = await createSupabaseServerClient();
  const [{ data: source }, latest] = await Promise.all([
    supabase.from("mega_prompts").select("content").eq("brand_id", args.brandId).eq("version", args.version).maybeSingle(),
    latestMega(supabase, args.brandId),
  ]);
  if (!source || !latest) return "not-found";
  const wanted = normalizeMega(source.content);
  await insertMega(supabase, {
    ...args,
    previous: normalizeMega(latest.content),
    previousVersion: latest.version,
    next: { intro: wanted.intro, rules: wanted.rules },
    note: `Retour aux règles de la v${args.version}`,
  });
  return "ok";
}

/* ------------------------------------------------------------------ */
/* Lien public de la planche                                            */
/* ------------------------------------------------------------------ */

export type BrandShare = { token: string; createdAt: string };

/** `undefined`: the feature's table does not exist yet (migration 0006 pending). */
export async function getBrandShare(brandId: string): Promise<BrandShare | null | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("brand_shares")
    .select("token,created_at")
    .eq("brand_id", brandId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isMissingTable(error)) return undefined;
  if (error) throw error;
  return data ? { token: data.token as string, createdAt: data.created_at as string } : null;
}

export async function createBrandShare(args: { brandId: string; orgId: string; userId: string }): Promise<"ok" | "migration-needed"> {
  const supabase = await createSupabaseServerClient();
  // 32 random bytes: the link is the only secret, it must not be guessable.
  const token = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("brand_shares").insert({ org_id: args.orgId, brand_id: args.brandId, token, created_by: args.userId });
  if (isMissingTable(error) || isForbidden(error)) return "migration-needed";
  if (error) throw error;
  return "ok";
}

/** Revoking keeps the row (audit) and kills the link at once. */
export async function revokeBrandShares(brandId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("brand_shares").update({ revoked_at: new Date().toISOString() }).eq("brand_id", brandId).is("revoked_at", null);
  if (error && !isMissingTable(error)) throw error;
}
