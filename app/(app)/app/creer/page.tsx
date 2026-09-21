import { redirect } from "next/navigation";

/** Créer and Studio were one gesture split across two pages: creation now happens on the wall. */
export default async function CreerPage({ searchParams }: { searchParams: Promise<{ brief?: string }> }) {
  const { brief } = await searchParams;
  redirect(brief ? `/app/studio?brief=${encodeURIComponent(brief)}` : "/app/studio");
}
