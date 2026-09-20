import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { keepOut } from "@/lib/onboarding";
import { archiveOut } from "@/lib/outs";
import { bumpMegaPrompt } from "@/lib/learning";
import { queueSocialGeneration } from "@/lib/jobs/engine";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  searchParams,
}: {
  searchParams?: { brand?: string; focus?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resolve active brand
  let brandId =
    searchParams?.brand ||
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

  const { data: outs } = await supabase
    .from("outs")
    .select("id,kind,payload,status,created_at")
    .eq("brand_id", brandId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  async function keep(formData: FormData) {
    "use server";
    const outId = String(formData.get("outId"));
    await keepOut(outId);
    redirect(`/app/studio?brand=${brandId}`);
  }

  async function archive(formData: FormData) {
    "use server";
    const outId = String(formData.get("outId"));
    await archiveOut(outId);
    redirect(`/app/studio?brand=${brandId}`);
  }

  async function feedback(formData: FormData) {
    "use server";
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const feedback = String(formData.get("feedback") || "").slice(0, 300);
    await bumpMegaPrompt({
      brandId: brandId!,
      userId: user.id,
      feedback,
    });
    redirect(`/app/studio?brand=${brandId}`);
  }

  async function regen(formData: FormData) {
    "use server";
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const brief = String(formData.get("brief") || "").slice(0, 300);
    const { jobId } = await queueSocialGeneration({
      orgId: orgId!,
      brandId: brandId!,
      userId: user.id,
      brief,
    });
    redirect(`/app/creer?job=${jobId}&brand=${brandId}`);
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h2 className="text-xl font-semibold text-zinc-900">Studio</h2>
      {!brand ? (
        <p className="mt-2 text-zinc-700">Aucune marque active.</p>
      ) : (outs || []).length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-700">
          Aucune sortie pour le moment. Lancez une génération dans{" "}
          <a href="/app/creer" className="text-accent underline underline-offset-4">
            Créer
          </a>
          .
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {(outs || []).map((o) => {
            const imageUrl = o.payload?.storage_path
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/outs/${o.payload.storage_path}`
              : o.payload?.image_url;
            const focused = searchParams?.focus && searchParams.focus === o.id;
            return (
              <div
                key={o.id}
                className={`rounded-lg border p-3 ${focused ? "border-accent" : "border-zinc-200"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-zinc-800">
                    {o.kind} · {o.status}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {new Date(o.created_at).toLocaleString()}
                  </div>
                </div>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Sortie"
                    className="mt-2 aspect-square w-full rounded-md object-cover"
                  />
                ) : (
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-600">
                    {JSON.stringify(o.payload, null, 2)}
                  </pre>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {o.status !== "ready" ? (
                    <form action={keep}>
                      <input type="hidden" name="outId" value={o.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
                      >
                        Garder
                      </button>
                    </form>
                  ) : null}
                  <form action={archive}>
                    <input type="hidden" name="outId" value={o.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:border-accent"
                    >
                      Archiver
                    </button>
                  </form>
                </div>
                <form action={feedback} className="mt-3 space-y-2">
                  <label className="text-xs text-zinc-700">Retour NL → soft bump du méga</label>
                  <textarea
                    name="feedback"
                    rows={2}
                    placeholder="Ex: plus minimaliste, fond clair, style éditorial…"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:border-accent"
                    >
                      Appliquer au méga
                    </button>
                    <form action={regen} className="ml-auto flex items-center gap-2">
                      <input
                        type="hidden"
                        name="brief"
                        value="Re‑génération après feedback NL appliqué au méga."
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
                      >
                        Re‑générer
                      </button>
                    </form>
                  </div>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StudioPage() {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h2 className="text-xl font-semibold text-zinc-900">Studio</h2>
      <p className="mt-2 text-zinc-700">
        Liste des outs (stub). Historique de génération et exports.
      </p>
    </div>
  );
}

