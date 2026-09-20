import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MarquePage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ brand?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  let brandId = searchParams?.brand as string | undefined;
  if (!brandId) {
    const { data: firstBrand } = await supabase
      .from("brands")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    brandId = firstBrand?.id as string | undefined;
  }
  const { data: brand } = await supabase
    .from("brands")
    .select("id,name,slug,data")
    .eq("id", brandId || "")
    .maybeSingle();
  const { data: os } = await supabase
    .from("brand_os_versions")
    .select("version,summary,canon")
    .eq("brand_id", brandId || "")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: mega } = await supabase
    .from("mega_prompts")
    .select("version,content")
    .eq("brand_id", brandId || "")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: megaHistory } = await supabase
    .from("mega_prompts")
    .select("version,content,created_at")
    .eq("brand_id", brandId || "")
    .order("version", { ascending: false })
    .limit(5);

  async function saveNewVersion(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const summary = String(formData.get("summary") || "").trim();
    if (!summary) return;
    const { data: latestOs } = await supabase
      .from("brand_os_versions")
      .select("version,org_id,brand_id")
      .eq("brand_id", brandId || "")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextV = ((latestOs?.version as number | undefined) || 1) + 1;
    const orgId = latestOs?.org_id;
    await supabase.from("brand_os_versions").insert({
      org_id: orgId || null,
      brand_id: brandId,
      version: nextV,
      summary,
      canon: { bullets: summary.split("\n").slice(0, 5) },
      created_by: user.id,
    });
    await supabase.from("mega_prompts").insert({
      org_id: orgId || null,
      brand_id: brandId,
      title: `Mega‑prompt v${nextV}`,
      content: { intro: `OS confirmé:\n${summary}` },
      version: nextV,
      created_by: user.id,
    });
    redirect(`/app/marque?brand=${brandId}`);
  }
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h2 className="text-xl font-semibold text-zinc-900">
        Marque {brand?.name ? `· ${brand.name}` : ""}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 p-4">
          <h3 className="font-medium text-zinc-800">Brand OS</h3>
          <form action={saveNewVersion} className="mt-2 space-y-2">
            <textarea
              name="summary"
              rows={8}
              defaultValue={os?.summary || ""}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:border-accent"
            >
              Enregistrer une nouvelle version
            </button>
          </form>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <h3 className="font-medium text-zinc-800">Mega‑prompt</h3>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
            {mega?.content?.intro || "—"}
          </pre>
          {megaHistory && megaHistory.length > 0 ? (
            <div className="mt-3">
              <div className="text-sm font-medium text-zinc-800">Historique (derniers)</div>
              <ul className="mt-2 space-y-1 text-xs text-zinc-700">
                {megaHistory.map((m: any) => (
                  <li key={m.version}>
                    v{m.version} · {new Date(m.created_at as any).toLocaleDateString()} —{" "}
                    {String((m.content as any)?.changelog?.at(-1)?.note || "").slice(0, 80)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

