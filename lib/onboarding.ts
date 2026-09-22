import { redirect } from "next/navigation";
import { isMissingColumn } from "@/lib/db-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { brandColorFromPalette } from "@/lib/tokens";
import { BlockedUrlError, assertPublicUrl, safeFetchText } from "@/lib/safe-fetch";
import { extractSiteAssets, type SiteAssets } from "@/lib/site-assets";
import { buildBrandOS, isBrandOS, renderSummary, type BrandOS, type MegaPrompt } from "@/lib/brand-os";

/** oui = identité utilisable (porte A) · logo = un logo seul (A légère) · non = à créer (porte B). */
export type Door = "oui" | "logo" | "non";

export type OnboardingData = {
  brand_id?: string;
  door?: Door;
  internal_name?: string;
  display_name?: string;
  scrape?: { url?: string; corpus?: string };
  /** Logo déposé pendant l'onboarding : chemin Storage et adresse publique. */
  logo?: { path: string; url: string };
  /** Porte B : les directions proposées (avec leurs images) et celle qui a été choisie. */
  directions?: unknown[];
  direction_chosen?: number | null;
  identity_brief?: { ambition?: string; references?: string };
};

export type OnboardingSession = {
  id: string;
  org_id: string | null;
  created_by: string;
  seed: string | null;
  status: "draft" | "in_progress" | "completed" | "archived";
  data: OnboardingData;
};

export async function getActiveOnboardingSession(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("onboarding_sessions")
    .select("*")
    .eq("created_by", userId)
    .in("status", ["draft", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data as OnboardingSession | null;
}

/** Merges into the session's data: a later step never erases what an earlier one stored. */
export async function upsertOnboardingSession(args: { userId: string; orgId: string | null; seed?: string | null; data?: Partial<OnboardingData> }) {
  const supabase = await createSupabaseServerClient();
  const existing = await getActiveOnboardingSession(args.userId);
  const toSave = {
    org_id: args.orgId,
    created_by: args.userId,
    seed: args.seed === undefined ? (existing?.seed ?? null) : args.seed,
    status: "in_progress" as const,
    data: { ...(existing?.data ?? {}), ...(args.data ?? {}) },
  };
  const query = existing ? supabase.from("onboarding_sessions").update(toSave).eq("id", existing.id) : supabase.from("onboarding_sessions").insert(toSave);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as OnboardingSession;
}

/** A client that exists but was never validated (created before the gate, or left mid-way): pick its onboarding back up at the validation screen. */
export async function resumeOnboardingFor(args: { userId: string; orgId: string; brandId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase.from("brands").select("id,name,data").eq("id", args.brandId).maybeSingle();
  if (!brand) return false;
  const data = (brand.data ?? {}) as { seed?: string | null };
  await upsertOnboardingSession({ userId: args.userId, orgId: args.orgId, seed: data.seed ?? null, data: { brand_id: brand.id as string, display_name: brand.name as string } });
  return true;
}

export async function createDraftBrand(args: {
  orgId: string;
  userId: string;
  seed?: string | null;
  url?: string | null;
  name?: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  const name = args.name?.trim() || deriveBrandName(args.seed, args.url);
  // unique(org_id, slug): a second client with a similar name must not fail to be created.
  const slug = `${slugify(name) || "marque"}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await supabase
    .from("brands")
    .insert({
      org_id: args.orgId,
      name,
      slug,
      data: { seed: args.seed ?? null, url: args.url ?? null, named: Boolean(args.name?.trim()) },
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as { id: string; name: string; slug: string; data: Record<string, unknown> };
}

export async function ensureDraftOSAndMega(args: {
  orgId: string;
  brandId: string;
  userId: string;
  corpusOrSeed: string;
  /** What the user stated on the orientation screen: door, names. Wins over the corpus. */
  declared?: string | null;
  door?: Door;
}) {
  const supabase = await createSupabaseServerClient();

  // The analysis costs an LLM call: never redo it when v1 already exists (back button, double submit).
  const { data: existing } = await supabase
    .from("brand_os_versions")
    .select("id")
    .eq("brand_id", args.brandId)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const { data: brand } = await supabase
    .from("brands")
    .select("name")
    .eq("id", args.brandId)
    .maybeSingle();
  const { os, megaIntro, source } = await buildBrandOS({
    source: args.corpusOrSeed,
    nameHint: brand?.name ?? null,
    declared: args.declared ?? null,
  });
  const identity = { exists: args.door ?? "", fonts: { display: "", body: "" }, nonNegotiables: [], dated: [] };

  const { error: osErr } = await supabase.from("brand_os_versions").insert({
    org_id: args.orgId,
    brand_id: args.brandId,
    version: 1,
    summary: renderSummary(os),
    canon: { ...os, identity, generated_by: source },
    created_by: args.userId,
  });
  if (osErr) throw osErr;

  const megaContent: MegaPrompt = { intro: megaIntro, rules: [], changelog: [] };
  const { error: mpErr } = await supabase.from("mega_prompts").insert({
    org_id: args.orgId,
    brand_id: args.brandId,
    title: "Mega-prompt v1",
    content: megaContent,
    version: 1,
    created_by: args.userId,
  });
  if (mpErr) throw mpErr;

  // The scraper only knows the hostname; the analysis usually finds the real brand name. A name the user typed stays.
  const named = Boolean(((brand as { data?: { named?: boolean } } | null)?.data as { named?: boolean } | undefined)?.named);
  if (source === "llm" && os.name.trim() && !named) {
    await supabase.from("brands").update({ name: os.name.trim() }).eq("id", args.brandId);
  }
}

/**
 * The questionnaire corrects the draft in place: before validation the Brand OS is a working copy,
 * not history. After validation every change goes through the expert and creates a version.
 */
export async function saveCanonDraft(brandId: string, patch: (canon: BrandOS) => BrandOS): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase.from("brand_os_versions").select("id,canon").eq("brand_id", brandId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!row || !isBrandOS(row.canon)) return false;
  const extra = row.canon as BrandOS & { generated_by?: string };
  const next = { ...patch(row.canon), generated_by: extra.generated_by };
  const { error } = await supabase.from("brand_os_versions").update({ canon: next, summary: renderSummary(next) }).eq("id", row.id);
  if (error) throw error;
  return true;
}

/** The gate opens: the client's Brand OS is validated (v1), the engines may run. */
export async function validateBrand(args: { brandId: string; sessionId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("brands").update({ validated_at: new Date().toISOString() }).eq("id", args.brandId);
  // Before migration 0011 the column does not exist: the gate is simply not enforced.
  if (error && !isMissingColumn(error)) throw error;
  await markOnboardingCompleted(args.sessionId);
}

/** Stores the logo dropped during onboarding (already in Storage) on the brand, after checking the path is the brand's own. */
export async function saveBrandLogo(brandId: string, storagePath: string): Promise<{ ok: boolean; url: string | null }> {
  if (!storagePath.startsWith(`brands/${brandId}/logo/`) || !/\.(png|jpg|webp|svg)$/i.test(storagePath)) return { ok: false, url: null };
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/outs/${storagePath}`;
  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase.from("brands").select("data").eq("id", brandId).maybeSingle();
  const data = { ...((brand?.data as Record<string, unknown> | null) ?? {}), logo: { path: storagePath, url } };
  const { error } = await supabase.from("brands").update({ data }).eq("id", brandId);
  if (error) throw error;
  return { ok: true, url };
}

export async function markOnboardingCompleted(sessionId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("onboarding_sessions")
    .update({ status: "completed" })
    .eq("id", sessionId);
}

export function extractUrl(seed?: string | null) {
  if (!seed) return null;
  const m = seed.match(
    /\bhttps?:\/\/[^\s)]+/i
  );
  return m ? m[0] : null;
}

const NO_ASSETS: SiteAssets = { logo: null, image: null, siteName: null };

/** Only keep asset addresses that are public http(s) URLs: they end up in an <img src> shown to users. */
function publicOrNull(url: string | null): string | null {
  if (!url) return null;
  try {
    return assertPublicUrl(url).toString();
  } catch {
    return null;
  }
}

/** Reads the brand's page once: its text for the analysis, and what its <head> says of its identity. */
export async function scrapeSite(url: string): Promise<{ text: string; assets: SiteAssets }> {
  try {
    // The URL comes from user input: safeFetchText refuses non-public targets.
    const html = await safeFetchText(url);
    const found = extractSiteAssets(html, url);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      text: text.slice(0, 20000),
      assets: { logo: publicOrNull(found.logo), image: publicOrNull(found.image), siteName: found.siteName },
    };
  } catch (e) {
    if (e instanceof BlockedUrlError) {
      console.warn(`[onboarding] scrape bloqué: ${e.message}`);
    }
    return { text: "", assets: NO_ASSETS };
  }
}

export async function scrapeUrl(url: string): Promise<string> {
  return (await scrapeSite(url)).text;
}

/** Merges into brands.data (seed, url…): never replaces it. */
export async function saveBrandSource(brandId: string, source: { url: string; assets: SiteAssets; readChars: number }) {
  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase.from("brands").select("data").eq("id", brandId).maybeSingle();
  const data = { ...((brand?.data as Record<string, unknown> | null) ?? {}), url: source.url, site: { ...source.assets, readChars: source.readChars, readAt: new Date().toISOString() } };
  const { error } = await supabase.from("brands").update({ data }).eq("id", brandId);
  if (error) throw error;
}

function deriveBrandName(seed?: string | null, url?: string | null) {
  if (url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "");
    } catch {
      // ignore
    }
  }
  if (seed) {
    const words = seed.split(/\s+/).slice(0, 3).join(" ");
    return words || "Nouvelle marque";
  }
  return "Nouvelle marque";
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}


/**
 * Contexte commun des étapes 2 à 6 : utilisateur connecté + session d'onboarding avec sa marque.
 * Sans marque en cours, on repart de l'étape 1 au lieu de planter plus loin.
 */
export async function requireOnboardingBrand() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getActiveOnboardingSession(user.id);
  const brandId = session?.data?.brand_id as string | undefined;
  if (!session || !session.org_id || !brandId) redirect("/onboarding/01");
  return { supabase, user, session, orgId: session.org_id, brandId };
}

/** Brand OS v1 de la marque en cours d'onboarding, avec sa couleur. */
export async function getOnboardingBrandOS(brandId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: brand }, { data: os }] = await Promise.all([
    supabase.from("brands").select("name,data").eq("id", brandId).maybeSingle(),
    supabase
      .from("brand_os_versions")
      .select("summary,canon")
      .eq("brand_id", brandId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const canon: (BrandOS & { generated_by?: string }) | null = isBrandOS(os?.canon) ? os.canon : null;
  const data = (brand?.data ?? {}) as { logo?: { url?: string }; site?: { logo?: string | null } };
  return {
    name: (brand?.name as string | undefined) ?? "votre marque",
    summary: (os?.summary as string | undefined) ?? "",
    canon,
    color: brandColorFromPalette(canon?.visual.palette),
    logo: data.logo?.url ?? data.site?.logo ?? null,
  };
}
