import { isForbidden, isMissingColumn, isMissingRelation, isMissingTable } from "@/lib/db-errors";
import { chatJson, isLlmConfigured, MODEL_FAST } from "@/lib/llm/openrouter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_HISTORY_MESSAGES, MAX_TITLE, TITLE_SCHEMA, TITLE_SYSTEM, fallbackTitle, titleUserMessage, type ChatRole, type ConversationKind } from "@/lib/expert/model";
import { parseProposal, type Proposal } from "@/lib/expert/proposal";

export * from "@/lib/expert/model";
export * from "@/lib/expert/proposal";

/** Conversational model with vision. Quality over speed: this is the expertise the user pays for. */
export const MODEL_CHAT = process.env.OPENROUTER_MODEL_CHAT || "anthropic/claude-sonnet-5";

export type ProposalState = "pending" | "applied" | "dismissed";
/** A creation the expert received in image with a message. */
export type LookedAt = { id: string; url: string };
export type ThreadMessage = {
  id: string | null;
  role: ChatRole;
  content: string;
  proposal: Proposal | null;
  proposalState: ProposalState | null;
  creations: LookedAt[];
  appliedOsVersion: number | null;
  appliedMegaVersion: number | null;
  createdAt: string | null;
};

export type Conversation = { id: string; title: string; kind: ConversationKind; updatedAt: string; pending: number };
export type PendingProposal = { messageId: string; conversationId: string | null; conversationTitle: string; title: string; createdAt: string };
export type Decision = { messageId: string; conversationId: string | null; title: string; createdAt: string; osVersion: number | null; megaVersion: number | null };

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const MAX_CONVERSATIONS = 60;
const MAX_DECISIONS = 30;
const UUID = /^[0-9a-f-]{36}$/i;

/** "persisted" — the messages table exists (0005). "threaded" — conversations exist too (0010). */
export type ExpertStorage = "none" | "persisted" | "threaded";

const parseLookedAt = (value: unknown): LookedAt[] =>
  Array.isArray(value) ? value.filter((c): c is LookedAt => typeof c?.id === "string" && typeof c?.url === "string").slice(0, 8) : [];

function toMessage(row: Record<string, unknown>): ThreadMessage {
  return {
    id: row.id as string,
    role: row.role as ChatRole,
    content: row.content as string,
    proposal: parseProposal(row.proposal),
    proposalState: (row.proposal_state as ProposalState | null) ?? null,
    creations: parseLookedAt(row.creations),
    appliedOsVersion: (row.applied_os_version as number | null) ?? null,
    appliedMegaVersion: (row.applied_mega_version as number | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
  };
}

const FULL_COLUMNS = "id,role,content,proposal,proposal_state,created_at,creations,applied_os_version,applied_mega_version,conversation_id";
const BASE_COLUMNS = "id,role,content,proposal,proposal_state,created_at";

/** Which migrations are there. Cheap: one probe on the messages table. */
export async function detectStorage(supabase: Supabase): Promise<ExpertStorage> {
  const probe = await supabase.from("expert_messages").select("conversation_id").limit(1);
  if (isMissingTable(probe.error)) return "none";
  if (isMissingColumn(probe.error)) return "persisted";
  return "threaded";
}

/** The client's conversations, most recent first, with how many proposals each still waits on. */
export async function listConversations(brandId: string): Promise<{ conversations: Conversation[]; storage: ExpertStorage }> {
  const supabase = await createSupabaseServerClient();
  const storage = await detectStorage(supabase);
  if (storage !== "threaded") return { conversations: [], storage };
  const [{ data: rows, error }, { data: pending }] = await Promise.all([
    supabase.from("expert_conversations").select("id,title,kind,updated_at").eq("brand_id", brandId).is("archived_at", null).order("updated_at", { ascending: false }).limit(MAX_CONVERSATIONS),
    supabase.from("expert_messages").select("conversation_id").eq("brand_id", brandId).eq("proposal_state", "pending"),
  ]);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of pending ?? []) if (row.conversation_id) counts.set(row.conversation_id as string, (counts.get(row.conversation_id as string) ?? 0) + 1);
  return {
    storage,
    conversations: (rows ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) || "Nouvelle conversation",
      kind: (row.kind as ConversationKind) ?? "chat",
      updatedAt: row.updated_at as string,
      pending: counts.get(row.id as string) ?? 0,
    })),
  };
}

/** Verified to belong to the brand: an id from the URL or the browser never reaches another client. */
export async function getConversation(supabase: Supabase, brandId: string, id: string): Promise<{ id: string; title: string | null; kind: ConversationKind } | null> {
  if (!UUID.test(id)) return null;
  const { data } = await supabase.from("expert_conversations").select("id,title,kind").eq("id", id).eq("brand_id", brandId).is("archived_at", null).maybeSingle();
  return data ? { id: data.id as string, title: (data.title as string | null) ?? null, kind: (data.kind as ConversationKind) ?? "chat" } : null;
}

/**
 * Messages of one conversation. Before 0010 there is one thread per brand: `conversationId` is ignored.
 * Before 0005 nothing is stored: the expert still works, it just is not remembered across reloads.
 */
export async function loadThread(brandId: string, conversationId: string | null): Promise<{ messages: ThreadMessage[]; storage: ExpertStorage }> {
  const supabase = await createSupabaseServerClient();
  const storage = await detectStorage(supabase);
  if (storage === "none") return { messages: [], storage };
  if (storage === "threaded" && !conversationId) return { messages: [], storage };
  // The column list depends on the migration state: the query builder cannot type it, so the rows are read as records.
  let query = supabase.from("expert_messages").select(storage === "threaded" ? FULL_COLUMNS : BASE_COLUMNS).eq("brand_id", brandId);
  if (storage === "threaded") query = query.eq("conversation_id", conversationId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(MAX_HISTORY_MESSAGES * 2);
  if (error) throw error;
  return { messages: ((data ?? []) as unknown as Record<string, unknown>[]).reverse().map(toMessage), storage };
}

/** Proposals still waiting for a yes, across every conversation of the client. */
export async function listPendingProposals(brandId: string): Promise<PendingProposal[]> {
  const supabase = await createSupabaseServerClient();
  const query = (columns: string) => supabase.from("expert_messages").select(columns).eq("brand_id", brandId).eq("proposal_state", "pending").order("created_at", { ascending: false }).limit(20);
  let { data, error } = await query("id,proposal,created_at,conversation_id,conversation:expert_conversations(title)");
  // Before 0010: no conversations to join, the proposals still exist on the brand's single thread.
  if (isMissingRelation(error) || isMissingColumn(error)) ({ data, error } = await query("id,proposal,created_at"));
  if (isMissingTable(error)) return [];
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => {
    const proposal = parseProposal(row.proposal);
    if (!proposal) return [];
    const conversation = row.conversation as { title: string | null } | null | undefined;
    return [{ messageId: row.id as string, conversationId: (row.conversation_id as string | null) ?? null, conversationTitle: conversation?.title || "Conversation", title: proposal.title, createdAt: row.created_at as string }];
  });
}

/** What was applied to the brand through the expert, most recent first. */
export async function listDecisions(brandId: string): Promise<Decision[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expert_messages")
    .select("id,proposal,created_at,conversation_id,applied_os_version,applied_mega_version")
    .eq("brand_id", brandId)
    .eq("proposal_state", "applied")
    .order("created_at", { ascending: false })
    .limit(MAX_DECISIONS);
  if (isMissingTable(error)) return [];
  if (isMissingColumn(error)) {
    const fallback = await supabase.from("expert_messages").select("id,proposal,created_at").eq("brand_id", brandId).eq("proposal_state", "applied").order("created_at", { ascending: false }).limit(MAX_DECISIONS);
    return (fallback.data ?? []).flatMap((row) => {
      const proposal = parseProposal(row.proposal);
      return proposal ? [{ messageId: row.id as string, conversationId: null, title: proposal.title, createdAt: row.created_at as string, osVersion: null, megaVersion: null }] : [];
    });
  }
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const proposal = parseProposal(row.proposal);
    if (!proposal) return [];
    return [{
      messageId: row.id as string,
      conversationId: (row.conversation_id as string | null) ?? null,
      title: proposal.title,
      createdAt: row.created_at as string,
      osVersion: (row.applied_os_version as number | null) ?? null,
      megaVersion: (row.applied_mega_version as number | null) ?? null,
    }];
  });
}

/* ------------------------------------------------------------------ */
/* Écriture                                                            */
/* ------------------------------------------------------------------ */

/** A new conversation; `null` before 0010 (messages then go to the brand's single thread). */
export async function createConversation(supabase: Supabase, args: { brand: { id: string; org_id: string }; userId: string; kind: ConversationKind; title?: string | null }): Promise<string | null> {
  const { data, error } = await supabase
    .from("expert_conversations")
    .insert({ org_id: args.brand.org_id, brand_id: args.brand.id, kind: args.kind, title: args.title ?? null, created_by: args.userId })
    .select("id")
    .single();
  if (isMissingTable(error) || isForbidden(error)) return null;
  if (error) throw error;
  return data.id as string;
}

/**
 * Best effort: a conversation that cannot be saved must not break the answer being read.
 * Takes a client created inside the request: this runs when the stream ends, where cookies()
 * is no longer reachable. Returns the ids of the two stored messages.
 */
export async function saveExchange(
  supabase: Supabase,
  args: { brand: { id: string; org_id: string }; userId: string; conversationId: string | null; question: string; answer: string; proposal: Proposal | null; creations: LookedAt[] }
): Promise<{ userId: string | null; assistantId: string | null }> {
  const base = { org_id: args.brand.org_id, brand_id: args.brand.id, created_by: args.userId };
  const now = Date.now();
  const rows = (threaded: boolean) => [
    { ...base, role: "user", content: args.question, created_at: new Date(now).toISOString(), ...(threaded ? { conversation_id: args.conversationId } : {}) },
    {
      ...base,
      role: "assistant",
      content: args.answer,
      proposal: args.proposal,
      proposal_state: args.proposal ? "pending" : null,
      created_at: new Date(now + 1).toISOString(),
      ...(threaded ? { conversation_id: args.conversationId, creations: args.creations } : {}),
    },
  ];
  let { data, error } = await supabase.from("expert_messages").insert(rows(true)).select("id,role");
  if (isMissingColumn(error)) ({ data, error } = await supabase.from("expert_messages").insert(rows(false)).select("id,role"));
  if (error) {
    if (!isMissingTable(error) && !isForbidden(error)) console.error("[expert] conversation non enregistrée —", error.message);
    return { userId: null, assistantId: null };
  }
  if (args.conversationId) {
    await supabase.from("expert_conversations").update({ updated_at: new Date(now + 1).toISOString() }).eq("id", args.conversationId).eq("brand_id", args.brand.id);
  }
  return {
    userId: (data?.find((r) => r.role === "user")?.id as string | undefined) ?? null,
    assistantId: (data?.find((r) => r.role === "assistant")?.id as string | undefined) ?? null,
  };
}

/** After the first exchange, the model names the conversation; without a model, the first words do. */
export async function titleConversation(supabase: Supabase, args: { brandId: string; conversationId: string; question: string; answer: string }): Promise<string> {
  let title = fallbackTitle(args.question);
  if (isLlmConfigured()) {
    try {
      const out = await chatJson<{ title: string }>({ model: MODEL_FAST, system: TITLE_SYSTEM, user: titleUserMessage(args.question, args.answer), schemaName: "title", schema: TITLE_SCHEMA, maxTokens: 60, timeoutMs: 15_000 });
      const clean = out.title?.trim().replace(/^["«\s]+|["»\s.]+$/g, "").slice(0, MAX_TITLE);
      if (clean) title = clean;
    } catch (e) {
      console.error("[expert] titre de conversation : repli —", e instanceof Error ? e.message : e);
    }
  }
  await supabase.from("expert_conversations").update({ title }).eq("id", args.conversationId).eq("brand_id", args.brandId).is("title", null);
  return title;
}

export async function renameConversation(brandId: string, conversationId: string, title: string) {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
  if (!clean || !UUID.test(conversationId)) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("expert_conversations").update({ title: clean }).eq("id", conversationId).eq("brand_id", brandId);
  if (error && !isMissingTable(error)) throw error;
}

/** Archiving hides the conversation; its decisions stay in the brand's history. */
export async function archiveConversation(brandId: string, conversationId: string) {
  if (!UUID.test(conversationId)) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("expert_conversations").update({ archived_at: new Date().toISOString() }).eq("id", conversationId).eq("brand_id", brandId);
  if (error && !isMissingTable(error)) throw error;
}

export async function setProposalState(brandId: string, messageId: string, state: ProposalState, versions?: { os: number | null; mega: number | null }) {
  const supabase = await createSupabaseServerClient();
  const target = () => supabase.from("expert_messages").update;
  let { error } = await target()({ proposal_state: state, ...(versions ? { applied_os_version: versions.os, applied_mega_version: versions.mega } : {}) }).eq("id", messageId).eq("brand_id", brandId);
  if (isMissingColumn(error)) ({ error } = await target()({ proposal_state: state }).eq("id", messageId).eq("brand_id", brandId));
  if (error && !isMissingTable(error)) throw error;
}

/** Before 0010 only: wipe the brand's single thread. */
export async function clearThread(brandId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("expert_messages").delete().eq("brand_id", brandId);
  if (error && !isMissingTable(error)) throw error;
}
