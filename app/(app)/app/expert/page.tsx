import { redirect } from "next/navigation";
import { Eraser } from "lucide-react";
import { ExpertChat } from "@/components/expert/ExpertChat";
import { BrandCard, ButtonLink, Card, CardHeader, Empty, Meta, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { clearThread, loadThread } from "@/lib/expert";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ExpertPage() {
  const { brand, os, mega } = await getWorkspace();

  if (!brand || !os) {
    return (
      <Empty
        title="L’expert a besoin d’une marque"
        action={<ButtonLink href={brand ? "/app/marque" : "/onboarding"}>{brand ? "Ouvrir la marque" : "Analyser une marque"}</ButtonLink>}
      >
        L’expert conseille à partir du Brand OS d’une marque. Analysez-en une, puis revenez lui parler.
      </Empty>
    );
  }

  const thread = await loadThread(brand.id);
  const rules = mega?.rules.length ?? 0;

  async function reset() {
    "use server";
    const { brand } = await getWorkspace();
    if (brand) await clearThread(brand.id);
    redirect("/app/expert");
  }

  return (
    <>
      <header>
        <Meta>Expert · {brand.name}</Meta>
        <h1 className="mt-2 font-display text-display text-ink">
          L’expert de <em className="highlighter">{brand.name}</em>
        </h1>
      </header>

      <BrandCard>
        <div className="grid gap-2">
          <span className="font-mono text-meta opacity-80">
            Brand OS v{os.version} · {rules} règle{rules > 1 ? "s" : ""} apprise{rules > 1 ? "s" : ""}
          </span>
          <p className="max-w-[46ch] font-display text-h1">
            Un directeur de création qui connaît cette marque par cœur. Parlez-lui normalement.
          </p>
          <p className="max-w-prose text-small opacity-80">
            Il a sous les yeux son Brand OS, les règles que vous lui avez apprises, vos créations gardées et votre planning. Chaque
            marque a son expert et sa conversation : changez de marque, vous changez d’interlocuteur.
          </p>
        </div>
      </BrandCard>

      {!isLlmConfigured() ? (
        <Notice tone="warning">L’expert n’est pas configuré sur ce serveur (OPENROUTER_API_KEY manquante).</Notice>
      ) : null}
      {!thread.persisted ? (
        <Notice tone="warning">
          La conversation fonctionne, mais ne sera pas mémorisée tant que la base n’est pas à jour : rejouez{" "}
          <code className="font-mono text-meta">supabase/migrations/0004_calendar_expert.sql</code> dans Supabase → SQL Editor.
        </Notice>
      ) : null}

      <Card>
        <CardHeader
          title="Conversation"
          aside={
            thread.messages.length ? (
              <form action={reset}>
                <SubmitButton variant="ghost" pendingLabel="…">
                  <Eraser size={16} strokeWidth={1.75} /> Repartir de zéro
                </SubmitButton>
              </form>
            ) : (
              <Meta>Entrée pour envoyer · Maj+Entrée pour aller à la ligne</Meta>
            )
          }
        />
        {/* key: switching brand must never show the previous brand's conversation */}
        <ExpertChat key={brand.id} brandName={brand.name} initialMessages={thread.messages} />
      </Card>
    </>
  );
}
