"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUp, Check, LoaderCircle, X } from "lucide-react";
import { applyProposal, dismissProposal } from "@/app/(app)/app/expert/actions";
import type { BrandOS, MegaPrompt } from "@/lib/brand-os/model";
import { MAX_MESSAGE_CHARS, SUGGESTIONS, type ChatMessage } from "@/lib/expert/model";
import { describeChanges, parseProposal, splitAnswer, type Proposal } from "@/lib/expert/proposal";

type ProposalState = "pending" | "applied" | "dismissed";
/** What the thread shows: readable text, plus the proposal it may carry. */
export type ChatItem = {
  id: string | null;
  role: ChatMessage["role"];
  content: string;
  proposal: Proposal | null;
  proposalState: ProposalState | null;
  /** True while the model is still writing the proposal block (never show raw JSON). */
  drafting?: boolean;
};

/** **gras** inline, sans HTML brut : la réponse du modèle n'est jamais injectée telle quelle. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part
  );
}

/** Rendu minimal du markdown que produit l'expert : titres, listes, paragraphes. */
function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`grid gap-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"} marker:text-mute`}>
        {list.items.map((item, i) => <li key={i}>{inline(item)}</li>)}
      </Tag>
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      heading ? <h3 key={blocks.length} className="text-title text-ink">{inline(heading[1])}</h3> : <p key={blocks.length}>{inline(line)}</p>
    );
  }
  flush();
  return <div className="grid gap-3">{blocks}</div>;
}

/** Avant → après, et la décision. Le diff est calculé sur l'état ACTUEL de la marque. */
function ProposalCard({
  item,
  os,
  mega,
  onSettled,
}: {
  item: ChatItem;
  os: BrandOS | null;
  mega: MegaPrompt;
  onSettled: (state: ProposalState, note: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const proposal = item.proposal!;
  const changes = os ? describeChanges(os, mega, proposal) : [];
  const state = item.proposalState ?? "pending";

  return (
    <section aria-label="Proposition de l’expert" className="grid gap-4 rounded-inner bg-tint p-4 transition-colors duration-(--duration-retint) ease-cimaise">
      <header className="grid gap-1">
        <span className="font-mono text-meta text-mute">
          Proposition{state === "applied" ? " · appliquée" : state === "dismissed" ? " · écartée" : ""}
        </span>
        <h3 className="font-display text-h2 font-normal text-ink">{proposal.title}</h3>
        {proposal.reason ? <p className="text-small text-mute">{proposal.reason}</p> : null}
      </header>

      {state === "pending" ? (
        changes.length ? (
          <dl className="grid gap-3">
            {changes.map((change) => (
              <div key={`${change.label}-${change.before}-${change.after}`} className="grid gap-1 rounded-inner bg-card p-3">
                <dt className="font-mono text-meta text-mute">{change.label}</dt>
                <dd className="grid gap-1 text-small md:grid-cols-[1fr_auto_1fr] md:items-start md:gap-3">
                  <span className={change.before ? "text-mute line-through decoration-line" : "text-mute"}>{change.before || "—"}</span>
                  <ArrowRight size={16} strokeWidth={1.75} className="hidden text-mute md:block" aria-hidden />
                  <span className="text-ink">{change.after || "— (retirée)"}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-small text-mute">
            {os ? "La marque est déjà dans cet état : rien à appliquer." : "Cette marque n’a pas encore de Brand OS structuré : relancez l’analyse depuis l’écran Marque."}
          </p>
        )
      ) : null}

      {failure ? <p role="alert" className="rounded-inner bg-danger-tint px-3 py-2 text-small text-danger">{failure}</p> : null}

      {state === "pending" && changes.length ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setFailure(null);
                const result = await applyProposal(proposal, item.id);
                if (result.ok) onSettled("applied", result.message);
                else setFailure(result.message);
              })
            }
            className="inline-flex items-center gap-2 rounded-pill bg-ink px-6 py-3 text-small font-semibold text-card transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px disabled:opacity-50"
          >
            {pending ? <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" /> : <Check size={16} strokeWidth={1.75} />}
            Appliquer à la marque
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await dismissProposal(item.id);
                onSettled("dismissed", null);
              })
            }
            className="inline-flex items-center gap-2 rounded-pill px-4 py-3 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink disabled:opacity-50"
          >
            <X size={16} strokeWidth={1.75} /> Laisser tomber
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ExpertChat({
  brandName,
  initialMessages,
  os,
  mega,
  persisted,
  initialDraft,
  focus: initialFocus = null,
}: {
  brandName: string;
  initialMessages: ChatItem[];
  /** True when the thread is stored server-side (migration applied). */
  persisted: boolean;
  /** A message typed elsewhere (client home, a to-do line): sent once on arrival. */
  initialDraft?: string;
  /** A creation picked in the Studio: the expert looks at it first. */
  focus?: { id: string; src: string; label: string } | null;
  /** Current state of the brand, so a proposal shows a real before → after. */
  os: BrandOS | null;
  mega: MegaPrompt;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatItem[]>(initialMessages);
  const [notice, setNotice] = useState<string | null>(null);
  const [focus, setFocus] = useState(initialFocus);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Sent once: the parameter is dropped from the URL first, so a refresh or a remount cannot resend it.
  const sentInitial = useRef(false);
  useEffect(() => {
    if (!initialDraft || sentInitial.current) return;
    sentInitial.current = true;
    router.replace("/app/expert");
    void send(initialDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately on mount only
  }, []);

  async function send(text: string) {
    const question = text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!question || busy) return;
    const asItem = (role: ChatMessage["role"], content: string): ChatItem => ({ id: null, role, content, proposal: null, proposalState: null });
    const history: ChatItem[] = [...messages, asItem("user", question)];
    setMessages([...history, asItem("assistant", "")]);
    setNotice(null);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/expert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The model only needs roles and text; proposals already applied live in the Brand OS it receives.
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), focusOutId: focus?.id }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error || "L’expert est indisponible.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        const { text, pending } = splitAnswer(answer);
        setMessages([...history, { ...asItem("assistant", text), drafting: pending }]);
      }
      if (!answer.trim()) throw new Error("L’expert n’a rien répondu. Réessayez.");
      const { text, raw } = splitAnswer(answer);
      const proposal = raw ? parseProposal(raw) : null;
      setMessages([
        ...history,
        { ...asItem("assistant", text || "Voici ce que je propose."), proposal, proposalState: proposal ? "pending" : null },
      ]);
      // The exchange was stored before the stream closed: reload it to get message ids,
      // so that "applied" / "dismissed" is remembered.
      if (persisted) router.refresh();
    } catch (e) {
      setMessages(history.slice(0, -1));
      setDraft(question);
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line (and never while composing accents/IME).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  }

  return (
    <div className="grid gap-4">
      <div aria-live="polite" className="grid max-h-[60vh] min-h-64 content-start gap-4 overflow-y-auto rounded-inner bg-soft p-4">
        {messages.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-small text-mute">
              Dites-lui ce qui ne va pas dans les contenus de {brandName}, ou ce que vous voulez faire évoluer. Il regarde les dernières créations, discute, puis propose les changements à appliquer à la marque. Pour démarrer :
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  disabled={busy}
                  className="rounded-pill bg-card px-4 py-2 text-left text-small text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-ink hover:text-card disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message, index) =>
          message.role === "user" ? (
            <div key={index} className="max-w-[85%] justify-self-end whitespace-pre-wrap rounded-card rounded-br-tag bg-ink px-4 py-3 text-body text-card">
              {message.content}
            </div>
          ) : (
            <div key={index} className="grid max-w-[92%] gap-3 justify-self-start rounded-card rounded-bl-tag bg-card px-4 py-3 text-body text-ink">
              {message.content ? (
                <Answer text={message.content} />
              ) : message.drafting || message.proposal ? null : (
                <span className="inline-flex items-center gap-2 text-small text-mute">
                  <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" /> L’expert réfléchit…
                </span>
              )}
              {message.drafting ? (
                <span className="inline-flex items-center gap-2 text-small text-mute">
                  <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" /> Il rédige une proposition…
                </span>
              ) : null}
              {message.proposal ? (
                <ProposalCard
                  item={message}
                  os={os}
                  mega={mega}
                  onSettled={(state, note) => {
                    setMessages((current) => current.map((m, i) => (i === index ? { ...m, proposalState: state } : m)));
                    setNotice(note);
                    // The brand changed: reload its current state (and the workspace colour) from the server.
                    router.refresh();
                  }}
                />
              ) : null}
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      {notice ? <p role="status" className="rounded-inner bg-success-tint px-4 py-3 text-small text-success">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-inner bg-danger-tint px-4 py-3 text-small text-danger">{error}</p> : null}

      {focus ? (
        <div className="flex items-center gap-3 rounded-inner bg-tint p-2 pr-3">
          <span className="relative block size-12 flex-none overflow-hidden rounded-inner bg-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={focus.src} alt="" className="absolute inset-0 size-full object-cover" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-meta text-mute">À propos de cette création</span>
            <span className="block truncate text-small text-ink">{focus.label}</span>
          </span>
          <button type="button" onClick={() => setFocus(null)} aria-label="Ne plus parler de cette création" className="grid size-8 flex-none place-items-center rounded-pill text-mute transition duration-(--duration-fast) ease-cimaise hover:bg-card hover:text-ink">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-card bg-soft p-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder={focus ? "Qu’est-ce qui ne va pas dans cette création ?" : `Parlez à l’expert de ${brandName} comme à un collègue…`}
          aria-label="Votre message"
          className="w-full resize-none bg-transparent px-3 py-2 text-body text-ink placeholder:text-mute focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Envoyer"
          className="grid size-10 flex-none place-items-center rounded-pill bg-ink text-card transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px disabled:opacity-40"
        >
          {busy ? <LoaderCircle size={18} strokeWidth={1.75} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={1.75} />}
        </button>
      </form>
    </div>
  );
}
