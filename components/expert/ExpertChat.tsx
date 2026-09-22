"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUp, Check, ChevronDown, Copy, Eye, LoaderCircle, Paperclip, Sparkles, Square, X } from "lucide-react";
import { applyProposal, dismissProposal } from "@/app/(app)/app/expert/actions";
import type { BrandOS, MegaPrompt } from "@/lib/brand-os/model";
import type { ExpertStorage, LookedAt, PendingProposal, ThreadMessage } from "@/lib/expert";
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
  /** The creations the expert received in image with this answer. */
  creations: LookedAt[];
  appliedOsVersion?: number | null;
  appliedMegaVersion?: number | null;
  createdAt?: string | null;
  /** True while the model is still writing the proposal block (never show raw JSON). */
  drafting?: boolean;
};

type Creation = { id: string; src: string; label: string };
const TIME = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const asItem = (role: ChatMessage["role"], content: string): ChatItem => ({ id: null, role, content, proposal: null, proposalState: null, creations: [] });

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
          Proposition
          {state === "applied" ? ` · appliquée${item.appliedOsVersion ? ` · Brand OS v${item.appliedOsVersion}` : ""}${item.appliedMegaVersion ? ` · mega v${item.appliedMegaVersion}` : ""}` : state === "dismissed" ? " · écartée" : ""}
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

/** The images the expert actually received: proof, not a promise. */
function LookedAtStrip({ creations }: { creations: LookedAt[] }) {
  if (!creations.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <span className="inline-flex items-center gap-1 font-mono text-meta text-mute"><Eye size={14} strokeWidth={1.75} /> Il a regardé</span>
      {creations.map((creation) => (
        <Link key={creation.id} href={`/app/studio?focus=${creation.id}`} className="relative block size-10 overflow-hidden rounded-tag bg-tint transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px" title="Ouvrir dans le Studio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={creation.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        </Link>
      ))}
    </div>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 rounded-pill px-2 py-1 font-mono text-meta text-mute opacity-0 transition duration-(--duration-fast) ease-cimaise hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
    >
      {copied ? <Check size={12} strokeWidth={1.75} /> : <Copy size={12} strokeWidth={1.75} />} {copied ? "Copié" : "Copier"}
    </button>
  );
}

export function ExpertChat({
  brandName,
  conversationId,
  initialMessages,
  pending,
  creations,
  os,
  mega,
  storage,
  initialDraft,
  startBilan = false,
  focus: initialFocus = null,
}: {
  brandName: string;
  /** Null: a conversation that does not exist yet; the server opens it with the first message. */
  conversationId: string | null;
  initialMessages: ThreadMessage[];
  /** Proposals still waiting, across all conversations of the client. */
  pending: PendingProposal[];
  /** Recent creations: what can be attached, and what "Il a regardé" thumbnails are resolved from. */
  creations: Creation[];
  os: BrandOS | null;
  mega: MegaPrompt;
  storage: ExpertStorage;
  /** A message typed elsewhere (client home, a calendar line): sent once on arrival. */
  initialDraft?: string;
  /** "Faire le bilan": the expert speaks first. */
  startBilan?: boolean;
  /** A creation picked in the Studio: the expert looks at it first. */
  focus?: Creation | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatItem[]>(initialMessages);
  const [notice, setNotice] = useState<string | null>(null);
  const [focus, setFocus] = useState(initialFocus);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Sent once: the parameter is dropped from the URL first, so a refresh or a remount cannot resend it.
  const sentInitial = useRef(false);
  useEffect(() => {
    if ((!initialDraft && !startBilan) || sentInitial.current) return;
    sentInitial.current = true;
    router.replace(conversationId ? `/app/expert?c=${conversationId}` : "/app/expert");
    void send(startBilan ? "Fais le bilan de cette marque." : initialDraft!, { bilan: startBilan });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately on mount only
  }, []);

  function stop() {
    abortRef.current?.abort();
  }

  async function send(text: string, options: { bilan?: boolean } = {}) {
    const question = text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!question || busy) return;
    const history: ChatItem[] = [...messages, asItem("user", question)];
    setMessages([...history, asItem("assistant", "")]);
    setNotice(null);
    setDraft("");
    setPicking(false);
    setError(null);
    setBusy(true);
    if (textareaRef.current) textareaRef.current.style.height = "";
    const controller = new AbortController();
    abortRef.current = controller;
    let openedId: string | null = null;
    try {
      const res = await fetch("/api/expert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        // The model only needs roles and text; proposals already applied live in the Brand OS it receives.
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), focusOutId: focus?.id, conversationId, bilan: options.bilan === true }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error || "L’expert est indisponible.");
      }
      openedId = res.headers.get("X-Conversation-Id");
      const lookedAt = (res.headers.get("X-Looked-At") ?? "")
        .split(",")
        .flatMap((id) => {
          const known = creations.find((c) => c.id === id);
          return known ? [{ id, url: known.src }] : [];
        });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        const { text, pending: drafting } = splitAnswer(answer);
        setMessages([...history, { ...asItem("assistant", text), drafting, creations: lookedAt }]);
      }
      if (!answer.trim()) throw new Error("L’expert n’a rien répondu. Réessayez.");
      const { text, raw } = splitAnswer(answer);
      const proposal = raw ? parseProposal(raw) : null;
      setMessages([...history, { ...asItem("assistant", text || "Voici ce que je propose."), proposal, proposalState: proposal ? "pending" : null, creations: lookedAt }]);
      // The exchange was stored before the stream closed: reload to get message ids (so "applied" is
      // remembered) and, for a conversation opened by this message, land on its address.
      if (openedId && openedId !== conversationId) router.replace(`/app/expert?c=${openedId}`);
      else if (storage !== "none") router.refresh();
    } catch (e) {
      if (controller.signal.aborted) {
        // Stopped by the user: keep what was read, the server still stores the full answer.
        setMessages((current) => current.map((m, i) => (i === current.length - 1 ? { ...m, drafting: false } : m)));
        if (openedId && openedId !== conversationId) router.replace(`/app/expert?c=${openedId}`);
      } else {
        setMessages(history.slice(0, -1));
        setDraft(question);
        setError(e instanceof Error ? e.message : "Erreur réseau.");
      }
    } finally {
      abortRef.current = null;
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

  const empty = messages.length === 0;

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
      {/* ---- À décider : the proposals still waiting, wherever they were made ---- */}
      {pending.length ? (
        <details className="group rounded-inner bg-warning-tint px-4 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-small font-semibold text-warning">
            <Sparkles size={14} strokeWidth={1.75} /> {pending.length} proposition{pending.length > 1 ? "s" : ""} à décider
            <ChevronDown size={14} strokeWidth={1.75} className="ml-auto transition duration-(--duration-fast) group-open:rotate-180" />
          </summary>
          <ul className="mt-2 grid gap-1">
            {pending.map((p) => (
              <li key={p.messageId}>
                <Link
                  href={p.conversationId === conversationId ? `#${p.messageId}` : p.conversationId ? `/app/expert?c=${p.conversationId}#${p.messageId}` : "#"}
                  className="flex flex-wrap items-baseline gap-x-2 text-small text-ink hover:underline underline-offset-4"
                >
                  {p.title}
                  <span className="font-mono text-meta text-mute">{p.conversationTitle} · {TIME.format(new Date(p.createdAt))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <span />
      )}

      {/* ---- The thread: the only thing that scrolls ---- */}
      <div aria-live="polite" className="grid min-h-0 content-start gap-4 overflow-y-auto px-1 py-2">
        {empty ? (
          <div className="grid gap-4 self-center justify-self-center py-8 text-center">
            <p className="max-w-[36ch] font-display text-h1 text-ink">Qu’est-ce qui ne va pas chez {brandName} ?</p>
            <p className="max-w-[48ch] justify-self-center text-small text-mute">
              Il regarde les dernières créations, discute, puis propose un changement précis de la marque. Vous validez d’un clic ; les contenus suivants en tiennent compte.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => void send("Fais le bilan de cette marque.", { bilan: true })} disabled={busy} className="inline-flex items-center gap-2 rounded-pill bg-ink px-4 py-2 text-small font-semibold text-card transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px disabled:opacity-50">
                <Sparkles size={16} strokeWidth={1.75} /> Faire le bilan
              </button>
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion)} disabled={busy} className="rounded-pill bg-soft px-4 py-2 text-left text-small text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-ink hover:text-card disabled:opacity-50">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message, index) =>
          message.role === "user" ? (
            <div key={message.id ?? `u${index}`} title={message.createdAt ? TIME.format(new Date(message.createdAt)) : undefined} className="max-w-[85%] justify-self-end whitespace-pre-wrap rounded-card rounded-br-tag bg-ink px-4 py-3 text-body text-card">
              {message.content}
            </div>
          ) : (
            <div key={message.id ?? `a${index}`} id={message.id ?? undefined} className="group grid max-w-[92%] scroll-mt-4 gap-3 justify-self-start rounded-card rounded-bl-tag bg-soft px-4 py-3 text-body text-ink">
              {message.content ? (
                <Answer text={message.content} />
              ) : message.drafting || message.proposal ? null : (
                <span className="inline-flex items-center gap-2 text-small text-mute">
                  <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" /> L’expert regarde et réfléchit…
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
              <LookedAtStrip creations={message.creations} />
              {message.content && !busy ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-meta text-mute opacity-0 transition duration-(--duration-fast) group-hover:opacity-100">{message.createdAt ? TIME.format(new Date(message.createdAt)) : ""}</span>
                  <CopyAnswer text={message.content} />
                </div>
              ) : null}
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      {/* ---- The composer ---- */}
      <div className="grid gap-2">
        {notice ? <p role="status" className="rounded-inner bg-success-tint px-4 py-3 text-small text-success">{notice}</p> : null}
        {error ? <p role="alert" className="rounded-inner bg-danger-tint px-4 py-3 text-small text-danger">{error}</p> : null}

        {picking ? (
          <div className="grid gap-2 rounded-inner bg-soft p-3">
            <span className="font-mono text-meta text-mute">Parler d’une création : l’expert la regarde en premier</span>
            {creations.length ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {creations.map((creation) => (
                  <button key={creation.id} type="button" onClick={() => { setFocus(creation); setPicking(false); }} title={creation.label} className="relative block size-16 flex-none overflow-hidden rounded-inner bg-tint transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={creation.src} alt={creation.label} className="absolute inset-0 size-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-small text-mute">Aucune création pour l’instant : créez-en dans le Studio.</p>
            )}
          </div>
        ) : null}

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

        <form onSubmit={onSubmit} className="flex items-end gap-1 rounded-card bg-soft p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          <button
            type="button"
            onClick={() => setPicking((open) => !open)}
            aria-label="Joindre une création"
            aria-pressed={picking}
            title="Parler d’une création"
            className="grid size-10 flex-none place-items-center rounded-pill text-mute transition duration-(--duration-fast) ease-cimaise hover:bg-card hover:text-ink aria-pressed:bg-card aria-pressed:text-ink"
          >
            <Paperclip size={18} strokeWidth={1.75} />
          </button>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              // Grows with the text, up to a few lines; the scroll takes over after.
              event.target.style.height = "";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={MAX_MESSAGE_CHARS}
            placeholder={focus ? "Qu’est-ce qui ne va pas dans cette création ?" : `Parlez à l’expert de ${brandName} comme à un collègue…`}
            aria-label="Votre message"
            className="max-h-[200px] min-h-10 w-full resize-none bg-transparent px-2 py-2 text-body text-ink placeholder:text-mute focus:outline-none"
          />
          {busy ? (
            <button type="button" onClick={stop} aria-label="Arrêter" title="Arrêter" className="grid size-10 flex-none place-items-center rounded-pill bg-ink text-card transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px">
              <Square size={14} strokeWidth={2} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()} aria-label="Envoyer" className="grid size-10 flex-none place-items-center rounded-pill bg-ink text-card transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px disabled:opacity-40">
              <ArrowUp size={18} strokeWidth={1.75} />
            </button>
          )}
        </form>
        <span className="px-2 font-mono text-meta text-mute">Entrée pour envoyer · Maj+Entrée pour la ligne · il regarde les 4 dernières créations à chaque message</span>
      </div>
    </div>
  );
}
