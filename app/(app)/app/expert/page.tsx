import Link from "next/link";
import { Archive, ClipboardCheck, MessageSquarePlus, Sparkles } from "lucide-react";
import { ExpertChat } from "@/components/expert/ExpertChat";
import { ButtonLink, Empty, Input, Meta, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getConversation, listConversations, listDecisions, listPendingProposals, loadThread, type Conversation } from "@/lib/expert";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { outImageUrl, type OutPayload } from "@/lib/outs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";
import { archive, rename } from "./actions";

export const dynamic = "force-dynamic";

const RECENT_CREATIONS = 12;
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const MIGRATION = "supabase/migrations/0010_expert_conversations.sql";

export default async function ExpertPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; message?: string; image?: string; bilan?: string }>;
}) {
  const { brand, os, mega } = await getWorkspace();
  const { c, message, image, bilan } = await searchParams;

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

  const supabase = await createSupabaseServerClient();
  const [{ conversations, storage }, pending, decisions, { data: recent }, focusRow] = await Promise.all([
    listConversations(brand.id),
    listPendingProposals(brand.id),
    listDecisions(brand.id),
    supabase.from("outs").select("id,payload").eq("brand_id", brand.id).neq("status", "archived").order("created_at", { ascending: false }).limit(RECENT_CREATIONS),
    // Arriving from a Studio tile: the conversation is about that creation.
    image && /^[0-9a-f-]{36}$/i.test(image) ? supabase.from("outs").select("id,payload").eq("id", image).eq("brand_id", brand.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const current = c && storage === "threaded" ? await getConversation(supabase, brand.id, c) : null;
  const thread = await loadThread(brand.id, current?.id ?? null);

  const creations = (recent ?? []).flatMap((out) => {
    const src = outImageUrl(out.payload as OutPayload | null);
    return src ? [{ id: out.id as string, src, label: (out.payload as OutPayload | null)?.brief || "Création sans brief" }] : [];
  });
  const focusPayload = (focusRow?.data?.payload ?? null) as OutPayload | null;
  const focusSrc = outImageUrl(focusPayload);
  const focus = focusRow?.data && focusSrc ? { id: focusRow.data.id as string, src: focusSrc, label: focusPayload?.brief || "Création sans brief" } : null;

  return (
    <>
      {!isLlmConfigured() ? <Notice tone="warning">L’expert n’est pas configuré sur ce serveur (OPENROUTER_API_KEY manquante).</Notice> : null}
      {storage === "none" ? (
        <Notice tone="warning">
          La conversation fonctionne, mais ne sera pas mémorisée tant que la base n’est pas à jour : rejouez <code className="font-mono text-meta">supabase/migrations/0005_expert_and_clients.sql</code> puis <code className="font-mono text-meta">{MIGRATION}</code> dans Supabase → SQL Editor.
        </Notice>
      ) : storage === "persisted" ? (
        <Notice tone="warning">
          Les conversations séparées, les bilans et l’historique des décisions attendent une mise à jour de la base : exécutez <code className="font-mono text-meta">{MIGRATION}</code> dans Supabase → SQL Editor (contrôle : 8 lignes). En attendant, l’expert garde un seul fil par client.
        </Notice>
      ) : null}

      {/* Full height on desktop: the rail and the conversation share the screen, only the thread scrolls. */}
      {/* A fixed height at every width: the thread scrolls inside, the page never grows with the conversation. */}
      <div className="grid h-[calc(100dvh-13rem)] min-h-[28rem] grid-cols-[minmax(0,1fr)] gap-4 lg:h-[calc(100vh-11rem)] lg:min-h-[32rem] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Rail brandName={brand.name} conversations={conversations} currentId={current?.id ?? null} decisions={decisions} threaded={storage === "threaded"} />

        <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-card bg-card p-3 md:p-4">
          <header className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-1">
            {current ? (
              <>
                <form action={rename} className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="hidden" name="conversationId" value={current.id} />
                  <Input
                    name="title"
                    defaultValue={current.title ?? ""}
                    placeholder="Sans titre : l’expert le nomme après le premier échange"
                    maxLength={60}
                    aria-label="Titre de la conversation"
                    className="min-w-0 flex-1 bg-transparent px-2 py-1 font-display text-h2 font-normal hover:bg-soft"
                  />
                </form>
                <form action={archive}>
                  <input type="hidden" name="conversationId" value={current.id} />
                  <SubmitButton variant="ghost" pendingLabel="…">
                    <Archive size={16} strokeWidth={1.75} /> Archiver
                  </SubmitButton>
                </form>
              </>
            ) : (
              <span className="px-2 font-display text-h2 font-normal text-ink">{bilan ? "Bilan" : "Nouvelle conversation"}</span>
            )}
          </header>
          <ExpertChat
            // Another conversation, or a new brand version, must restart from the server's state.
            key={`${brand.id}-${current?.id ?? "new"}-${os.version}-${mega?.version ?? 0}-${thread.messages.length}`}
            brandName={brand.name}
            conversationId={current?.id ?? null}
            initialMessages={thread.messages}
            pending={pending}
            creations={creations}
            os={os.canon}
            mega={{ intro: mega?.intro ?? "", rules: mega?.rules ?? [] }}
            storage={storage}
            initialDraft={message?.slice(0, 500)}
            startBilan={bilan === "1" && !current}
            focus={focus}
          />
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Rail({
  brandName,
  conversations,
  currentId,
  decisions,
  threaded,
}: {
  brandName: string;
  conversations: Conversation[];
  currentId: string | null;
  decisions: Awaited<ReturnType<typeof listDecisions>>;
  threaded: boolean;
}) {
  const body = (
    <div className="grid min-h-0 content-start gap-4">
      <div className="grid gap-2">
        <Link href="/app/expert" className="inline-flex items-center gap-2 rounded-pill bg-ink px-4 py-3 text-small font-semibold text-card transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px">
          <MessageSquarePlus size={16} strokeWidth={1.75} /> Nouvelle conversation
        </Link>
        <Link href="/app/expert?bilan=1" className="inline-flex items-center gap-2 rounded-pill bg-soft px-4 py-3 text-small font-semibold text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-line">
          <Sparkles size={16} strokeWidth={1.75} /> Faire le bilan
        </Link>
      </div>

      {threaded ? (
        <nav aria-label="Conversations" className="grid min-h-0 gap-1 overflow-y-auto">
          <Meta className="px-2 pb-1">Conversations · {brandName}</Meta>
          {conversations.length ? (
            conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/app/expert?c=${conversation.id}`}
                aria-current={conversation.id === currentId ? "page" : undefined}
                className="grid gap-0.5 rounded-inner px-3 py-2 transition duration-(--duration-fast) ease-cimaise hover:bg-soft aria-[current=page]:bg-tint"
              >
                <span className="flex items-center gap-2">
                  {conversation.kind === "bilan" ? <ClipboardCheck size={14} strokeWidth={1.75} className="flex-none text-mute" /> : null}
                  <span className="truncate text-small text-ink">{conversation.title}</span>
                  {conversation.pending ? <span aria-label={`${conversation.pending} proposition(s) en attente`} className="ml-auto size-2 flex-none rounded-pill bg-warning" /> : null}
                </span>
                <Meta>{DATE.format(new Date(conversation.updatedAt))}</Meta>
              </Link>
            ))
          ) : (
            <p className="px-3 py-2 text-small text-mute">Aucune conversation pour l’instant.</p>
          )}
        </nav>
      ) : null}

      {decisions.length ? (
        <section aria-label="Décisions appliquées" className="grid gap-1 border-t border-line pt-4">
          <Meta className="px-2 pb-1">Décisions · {decisions.length}</Meta>
          {decisions.slice(0, 8).map((decision) => (
            <Link
              key={decision.messageId}
              href={decision.conversationId ? `/app/expert?c=${decision.conversationId}#${decision.messageId}` : "/app/marque"}
              className="grid gap-0.5 rounded-inner px-3 py-2 transition duration-(--duration-fast) ease-cimaise hover:bg-soft"
            >
              <span className="line-clamp-2 text-small text-ink">{decision.title}</span>
              <Meta>
                {DATE.format(new Date(decision.createdAt))}
                {decision.osVersion ? ` · Brand OS v${decision.osVersion}` : ""}
                {decision.megaVersion ? ` · mega v${decision.megaVersion}` : ""}
              </Meta>
            </Link>
          ))}
          <Link href="/app/marque" className="px-3 py-1 font-mono text-meta text-mute underline underline-offset-4 hover:text-ink">Toutes les versions, dans Marque</Link>
        </section>
      ) : null}
    </div>
  );

  return (
    <>
      <aside className="hidden min-h-0 lg:block">{body}</aside>
      {/* On a phone the rail folds above the conversation. */}
      <details className="rounded-card bg-card p-3 lg:hidden">
        <summary className="cursor-pointer list-none text-small font-semibold text-ink">Conversations, bilan, décisions</summary>
        <div className="mt-3">{body}</div>
      </details>
    </>
  );
}
