import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { queueSocialGeneration } from "@/lib/jobs/engine";
import React from "react";

export const dynamic = "force-dynamic";

export default async function CreerPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resolve active brand
  let brandId =
    cookies().get("active_brand")?.value ||
    (await supabase
      .from("brands")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()).data?.id ||
    "";
  const { data: brand } = await supabase
    .from("brands")
    .select("id,org_id,name")
    .eq("id", brandId || "")
    .maybeSingle();
  const orgId = brand?.org_id as string;

  async function launchGen(formData: FormData) {
    "use server";
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const brief = String(formData.get("brief") || "").slice(0, 800);
    const brandId = String(formData.get("brandId") || "");
    const { data: brand } = await supabase
      .from("brands")
      .select("id,org_id")
      .eq("id", brandId)
      .maybeSingle();
    if (!brand) {
      throw new Error("Marque introuvable.");
    }
    const { jobId } = await queueSocialGeneration({
      orgId: brand.org_id as string,
      brandId: brand.id as string,
      userId: user.id,
      brief,
    });
    redirect(`/app/creer?job=${jobId}&brand=${brand.id}`);
  }

  const searchParams = (await import("next/headers")).headers();
  const url = new URL(
    (process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      "http://localhost:3000") + "/"
  );
  // The headers() isn't convenient to read search; use the server component prop approach in Next 15 usually,
  // but for simplicity we accept querystring visible client side to read.

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h2 className="text-xl font-semibold text-zinc-900">Créer</h2>
      {!brand ? (
        <p className="mt-2 text-zinc-700">Aucune marque active.</p>
      ) : (
        <>
          <form action={launchGen} className="mt-4 space-y-4">
            <input type="hidden" name="brandId" value={brand.id} />
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Type
              </label>
              <select
                name="type"
                defaultValue="social"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent md:w-64"
              >
                <option value="social">Social (1:1)</option>
                <option value="print" disabled>
                  Print (bientôt)
                </option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Brief (optionnel)
              </label>
              <textarea
                name="brief"
                rows={3}
                placeholder="Contexte/objectif du post…"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
            >
              Lancer la génération
            </button>
          </form>
          {/* Client-side status viewer */}
          <JobProgress />
        </>
      )}
    </div>
  );
}

function JobProgress() {
  "use client";
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [outLink, setOutLink] = React.useState<string | null>(null);

  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("job");
    if (!id) return;
    setJobId(id);
  }, []);

  React.useEffect(() => {
    if (!jobId) return;
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        const s = json?.job?.status || null;
        setStatus(s);
        if (s === "failed") {
          setError(json?.job?.error || "Échec de génération.");
        }
        if (s === "succeeded") {
          const outId = json?.job?.output?.out_id;
          if (outId) {
            setOutLink(`/app/studio?focus=${outId}`);
          }
        }
        if (!stop && s && s !== "succeeded" && s !== "failed" && s !== "canceled") {
          setTimeout(tick, 1000);
        }
      } catch (e: any) {
        setError(e?.message || "Erreur réseau");
      }
    }
    tick();
    return () => {
      stop = true;
    };
  }, [jobId]);

  if (!jobId) return null;
  return (
    <div className="mt-6 rounded-lg border border-zinc-200 p-4">
      <div className="text-sm text-zinc-800">
        Job <span className="font-mono">{jobId}</span> — Statut:{" "}
        <strong>{status || "…"}</strong>
      </div>
      {error ? <div className="mt-2 text-sm text-rose-700">{error}</div> : null}
      {outLink ? (
        <a
          href={outLink}
          className="mt-3 inline-flex rounded-md bg-accent px-3 py-1.5 text-white hover:opacity-90"
        >
          Ouvrir dans Studio
        </a>
      ) : null}
    </div>
  );
}

export default function CreerPage() {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h2 className="text-xl font-semibold text-zinc-900">Créer</h2>
      <p className="mt-2 text-zinc-700">
        Démarrer une nouvelle génération (stub). Sélection de prompts/briefs.
      </p>
    </div>
  );
}

