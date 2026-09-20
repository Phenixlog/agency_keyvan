import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOnboardingSession, keepOut } from "@/lib/onboarding";
import { queueSocialGeneration } from "@/lib/jobs/engine";
import { bumpMegaPrompt } from "@/lib/learning";
import React, { useState } from "react";

export const dynamic = "force-dynamic";

export default async function OB05() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getActiveOnboardingSession(user.id);
  const orgId = session?.org_id!;
  const brandId = session?.data?.brand_id as string;
  const { data: outs } = await supabase
    .from("outs")
    .select("id, kind, payload, status")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });

  async function keep(formData: FormData) {
    "use server";
    const outId = String(formData.get("outId"));
    await keepOut(outId);
    redirect("/onboarding/05");
  }
  async function launch() {
    "use server";
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { jobId } = await queueSocialGeneration({
      orgId: orgId!,
      brandId: brandId!,
      userId: user.id,
      brief: "OB‑05: preuve créa — premier social 1:1",
    });
    redirect(`/onboarding/05?job=${jobId}`);
  }
  async function feedback(formData: FormData) {
    "use server";
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const text = String(formData.get("feedback") || "").slice(0, 300);
    await bumpMegaPrompt({ brandId: brandId!, userId: user.id, feedback: text });
    redirect("/onboarding/05");
  }

  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">
        OB-05 · Preuve créa
      </h2>
      <p className="mt-2 text-zinc-700">Générez un visuel Social (1:1) réel, puis gardez au moins une sortie.</p>
      <form action={launch} className="mt-4">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-accent px-3 py-2 text-white hover:opacity-90"
        >
          Lancer une génération Social
        </button>
      </form>
      <JobProgress />
      <form action={feedback} className="mt-4 space-y-2">
        <label className="text-sm text-zinc-700">
          Retour NL (soft bump du méga, impacte les prochaines générations)
        </label>
        <textarea
          name="feedback"
          rows={2}
          placeholder="Ex: plus lisible, tons pastel, style minimaliste…"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 hover:border-accent"
        >
          Appliquer au méga
        </button>
      </form>
      <div className="mt-4 space-y-3">
        {(outs || []).map((o) => (
          <form key={o.id} action={keep} className="flex items-center gap-3">
            <div className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2">
              <div className="text-sm font-medium text-zinc-800">{o.kind}</div>
              <div className="text-sm text-zinc-600">
                {JSON.stringify(o.payload)}
              </div>
              <div className="text-xs text-zinc-500">Statut: {o.status}</div>
            </div>
            {o.status !== "ready" ? (
              <>
                <input type="hidden" name="outId" value={o.id} />
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-2 text-white hover:opacity-90"
                >
                  Garder
                </button>
              </>
            ) : (
              <span className="text-emerald-700 text-sm">Conservé</span>
            )}
          </form>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/onboarding/04"
          className="text-zinc-600 underline underline-offset-4"
        >
          Retour
        </Link>
        <Link
          href="/onboarding/06"
          className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Suivant
        </Link>
      </div>
    </div>
  );
}

function JobProgress() {
  "use client";
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    <div className="mt-4 rounded-md border border-zinc-200 p-3 text-sm text-zinc-800">
      Job {jobId} — Statut: <strong>{status || "…"}</strong>
      {error ? <div className="mt-1 text-rose-700">{error}</div> : null}
    </div>
  );
}

