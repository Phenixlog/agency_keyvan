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
            L’expertise derrière ce client. Dites ce qui ne va pas : il ajuste la marque.
          </p>
          <p className="max-w-prose text-small opacity-80">
            Il regarde les dernières créations, les compare au Brand OS, réfléchit stratégie avec vous, puis propose un changement
            précis. Vous validez d’un clic, et tous les contenus suivants de ce client en tiennent compte. Rien n’est appliqué sans
            vous, et chaque changement crée une nouvelle version.
          </p>
        </div>
      </BrandCard>

      {!isLlmConfigured() ? (
        <Notice tone="warning">L’expert n’est pas configuré sur ce serveur (OPENROUTER_API_KEY manquante).</Notice>
      ) : null}
      {!thread.persisted ? (
        <Notice tone="warning">
          La conversation fonctionne, mais ne sera pas mémorisée tant que la base n’est pas à jour : rejouez{" "}
          <code className="font-mono text-meta">supabase/migrations/0004_calendar_expert.sql</code> dans Supabase → SQL Editor. Les changements que vous appliquez, eux, sont bien enregistrés.
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
        {/* key: another brand, or a new version of this one, must restart from the server's state */}
        <ExpertChat
          // Persisted thread: the server is the truth, remount on any change. Otherwise the conversation
          // only lives in the browser, so a remount would erase it: key on the brand alone.
          key={thread.persisted ? `${brand.id}-${os.version}-${mega?.version ?? 0}-${thread.messages.length}` : brand.id}
          persisted={thread.persisted}
          brandName={brand.name}
          initialMessages={thread.messages}
          os={os.canon}
          mega={{ intro: mega?.intro ?? "", rules: mega?.rules ?? [] }}
        />
      </Card>
    </>
  );
}
