import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { brandColorFromPalette } from "@/lib/tokens";
import { BlockedUrlError, safeFetchText } from "@/lib/safe-fetch";
import { buildBrandOS, isBrandOS, renderSummary, type BrandOS, type MegaPrompt } from "@/lib/brand-os";

export type OnboardingSession = {
  id: string;
  org_id: string | null;
  created_by: string;
  seed: string | null;
  status: "draft" | "in_progress" | "completed" | "archived";
  data: any;
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

export async function upsertOnboardingSession(args: {
  userId: string;
  orgId: string | null;
  seed: string | null;
  brandId?: string | null;
  scrape?: { url?: string; corpus?: string } | null;
}) {
  const supabase = await createSupabaseServerClient();
  const existing = await getActiveOnboardingSession(args.userId);
  const payload: any = {};
  if (args.brandId) payload.brand_id = args.brandId;
  if (args.scrape) payload.scrape = args.scrape;
  const toSave = {
    org_id: args.orgId,
    created_by: args.userId,
    seed: args.seed,
    status: "in_progress" as const,
    data: payload,
  };
  if (existing) {
    const { data, error } = await supabase
      .from("onboarding_sessions")
      .update(toSave)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as OnboardingSession;
  } else {
    const { data, error } = await supabase
      .from("onboarding_sessions")
      .insert(toSave)
      .select("*")
      .single();
    if (error) throw error;
    return data as OnboardingSession;
  }
}

export async function createDraftBrand(args: {
  orgId: string;
  userId: string;
  seed?: string | null;
  url?: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  const name = deriveBrandName(args.seed, args.url);
  const slug = slugify(name);
  const { data, error } = await supabase
    .from("brands")
    .insert({
      org_id: args.orgId,
      name,
      slug,
      data: { seed: args.seed ?? null, url: args.url ?? null },
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as { id: string; name: string; slug: string; data: any };
}

export async function saveScrapeToBrand(brandId: string, corpus: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("brands")
    .update({ data: { corpus } })
    .eq("id", brandId);
  if (error) throw error;
}

export async function ensureDraftOSAndMega(args: {
  orgId: string;
  brandId: string;
  userId: string;
  corpusOrSeed: string;
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
  });

  const { error: osErr } = await supabase.from("brand_os_versions").insert({
    org_id: args.orgId,
    brand_id: args.brandId,
    version: 1,
    summary: renderSummary(os),
    canon: { ...os, generated_by: source },
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

  // The scraper only knows the hostname; the analysis usually finds the real brand name.
  if (source === "llm" && os.name.trim()) {
    await supabase.from("brands").update({ name: os.name.trim() }).eq("id", args.brandId);
  }
}

export async function updateOSAndMega(args: { brandId: string; summary: string }) {
  const supabase = await createSupabaseServerClient();
  // The summary is the user-facing, editable truth. The structured canon and the
  // mega-prompt stay: the image prompt composer reads the summary with priority.
  const { error } = await supabase
    .from("brand_os_versions")
    .update({ summary: args.summary })
    .eq("brand_id", args.brandId)
    .eq("version", 1);
  if (error) throw error;
}

export async function keepOut(outId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("outs").update({ status: "ready" }).eq("id", outId);
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

export async function scrapeUrl(url: string): Promise<string> {
  try {
    // The URL comes from user input: safeFetchText refuses non-public targets.
    const html = await safeFetchText(url);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 20000);
  } catch (e) {
    if (e instanceof BlockedUrlError) {
      console.warn(`[onboarding] scrape bloqué: ${e.message}`);
    }
    return "";
  }
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
    supabase.from("brands").select("name").eq("id", brandId).maybeSingle(),
    supabase
      .from("brand_os_versions")
      .select("summary,canon")
      .eq("brand_id", brandId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const canon: (BrandOS & { generated_by?: string }) | null = isBrandOS(os?.canon) ? os.canon : null;
  return {
    name: (brand?.name as string | undefined) ?? "votre marque",
    summary: (os?.summary as string | undefined) ?? "",
    canon,
    color: brandColorFromPalette(canon?.visual.palette),
  };
}
