"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUp, ArrowUpRight, LoaderCircle } from "lucide-react";
import { MAX_MESSAGE_CHARS, SUGGESTIONS, extractBriefs, type ChatMessage } from "@/lib/expert/model";

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

export function ExpertChat({ brandName, initialMessages }: { brandName: string; initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!question || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/expert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
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
        setMessages([...history, { role: "assistant", content: answer }]);
      }
      if (!answer.trim()) throw new Error("L’expert n’a rien répondu. Réessayez.");
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
              Posez une question sur {brandName}, demandez des idées, une légende, un avis sur un brief. Pour démarrer :
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
              ) : (
                <span className="inline-flex items-center gap-2 text-small text-mute">
                  <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" /> L’expert réfléchit…
                </span>
              )}
              {!busy || index < messages.length - 1
                ? extractBriefs(message.content).map((brief) => (
                    <Link
                      key={brief}
                      href={`/app/creer?brief=${encodeURIComponent(brief)}`}
                      className="inline-flex items-center gap-2 justify-self-start rounded-pill bg-tint px-4 py-2 text-small text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-ink hover:text-card"
                    >
                      Créer ce visuel <ArrowUpRight size={16} strokeWidth={1.75} />
                    </Link>
                  ))
                : null}
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      {error ? <p role="alert" className="rounded-inner bg-danger-tint px-4 py-3 text-small text-danger">{error}</p> : null}

      <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-card bg-soft p-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder={`Demandez quelque chose à l’expert de ${brandName}…`}
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
