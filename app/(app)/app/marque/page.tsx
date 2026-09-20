import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MarquePage({
  searchParams,
}: {
  searchParams?: { brand?: string };
}) {
  const supabase = createSupabaseServerClient();
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
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h2 className="text-xl font-semibold text-zinc-900">
        Marque {brand?.name ? `· ${brand.name}` : ""}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 p-4">
          <h3 className="font-medium text-zinc-800">Brand OS</h3>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
            {os?.summary || "—"}
          </pre>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <h3 className="font-medium text-zinc-800">Mega‑prompt</h3>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
            {mega?.content?.intro || "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}

