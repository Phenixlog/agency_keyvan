import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BlockedUrlError, safeFetchText } from "@/lib/safe-fetch";

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
  // Create v1 draft Brand OS summary (3-5 bullets) and mega prompt
  const bullets = draftBullets(args.corpusOrSeed);
  const summary = bullets.join("\n");
  const canon = { bullets };

  // Brand OS v1
  const { data: osV1, error: osErr } = await supabase
    .from("brand_os_versions")
    .insert({
      org_id: args.orgId,
      brand_id: args.brandId,
      version: 1,
      summary,
      canon,
      created_by: args.userId,
    })
    .select("*")
    .single();
  if (osErr && !String(osErr.message || "").includes("duplicate")) {
    throw osErr;
  }

  // Mega prompt v1
  const megaContent = { intro: draftMegaPrompt(args.corpusOrSeed) };
  const { error: mpErr } = await supabase.from("mega_prompts").insert({
    org_id: args.orgId,
    brand_id: args.brandId,
    title: "Mega-prompt v1 (brouillon)",
    content: megaContent,
    version: 1,
    created_by: args.userId,
  });
  if (mpErr && !String(mpErr.message || "").includes("duplicate")) {
    throw mpErr;
  }
}

export async function updateOSAndMega(args: {
  brandId: string;
  summary: string;
  bullets?: string[];
}) {
  const supabase = await createSupabaseServerClient();
  // Update latest version=1 for simplicity
  await supabase
    .from("brand_os_versions")
    .update({
      summary: args.summary,
      canon: { bullets: args.bullets ?? args.summary.split("\n").slice(0, 5) },
    })
    .eq("brand_id", args.brandId)
    .eq("version", 1);
  await supabase
    .from("mega_prompts")
    .update({
      content: { intro: `OS confirmé:\n${args.summary}` },
    })
    .eq("brand_id", args.brandId)
    .eq("version", 1);
}

export async function createStubJobsAndOuts(args: {
  orgId: string;
  brandId: string;
  userId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const stubOuts = [
    { kind: "social_post", payload: { text: "Post LinkedIn (stub)" } },
    { kind: "print", payload: { headline: "Affiche (stub)" } },
  ];
  // Jobs
  await supabase.from("jobs").insert([
    {
      org_id: args.orgId,
      brand_id: args.brandId,
      job_type: "creative_social",
      prompt: "Générer posts social (stub)",
      status: "succeeded",
      created_by: args.userId,
      output: { count: 1 },
    },
    {
      org_id: args.orgId,
      brand_id: args.brandId,
      job_type: "creative_print",
      prompt: "Générer print (stub)",
      status: "succeeded",
      created_by: args.userId,
      output: { count: 1 },
    },
  ]);
  // Outs (draft)
  const inserts = stubOuts.map((o) => ({
    org_id: args.orgId,
    brand_id: args.brandId,
    kind: o.kind,
    payload: o.payload,
    status: "draft",
    created_by: args.userId,
  }));
  await supabase.from("outs").insert(inserts);
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

function draftBullets(source: string) {
  const base = source.split(/[.!?\n]/).filter((s) => s.trim().length > 0);
  const uniq = Array.from(new Set(base.map((s) => s.trim()))).slice(0, 5);
  if (uniq.length === 0) {
    return [
      "Positionnement B2B orienté valeur produit.",
      "Public cible: décideurs techniques et produit.",
      "Promesse: clarté, vitesse, qualité.",
    ];
  }
  return uniq.slice(0, 5).map((s) => `• ${s}`);
}

function draftMegaPrompt(source: string) {
  return `Tu es un Brand OS pour une marque SaaS. À partir des éléments suivants, propose une communication claire et consistante.\n\nBase:\n${source.slice(
    0,
    2000
  )}\n\nDonne des idées de slogan et un ton.`;
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

