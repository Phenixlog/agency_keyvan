import { isForbidden, isMissingTable } from "@/lib/db-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_HISTORY_MESSAGES, type ChatRole } from "@/lib/expert/model";
import { parseProposal, type Proposal } from "@/lib/expert/proposal";

export * from "@/lib/expert/model";
export * from "@/lib/expert/proposal";

/** Conversational model with vision. Quality over speed: this is the expertise the user pays for. */
export const MODEL_CHAT = process.env.OPENROUTER_MODEL_CHAT || "anthropic/claude-sonnet-5";

export type ProposalState = "pending" | "applied" | "dismissed";
export type ThreadMessage = {
  id: string | null;
  role: ChatRole;
  content: string;
  proposal: Proposal | null;
  proposalState: ProposalState | null;
};

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * One continuous thread per brand. `persisted: false` means the table is not there yet
 * (migration pending): the expert still works, it just is not remembered across reloads.
 */
export async function loadThread(brandId: string): Promise<{ messages: ThreadMessage[]; persisted: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expert_messages")
    .select("id,role,content,proposal,proposal_state,created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES * 2);
  if (isMissingTable(error)) return { messages: [], persisted: false };
  if (error) throw error;
  const messages = (data ?? []).reverse().map((row) => ({
    id: row.id as string,
    role: row.role as ChatRole,
    content: row.content as string,
    proposal: parseProposal(row.proposal),
    proposalState: (row.proposal_state as ProposalState | null) ?? null,
  }));
  return { messages, persisted: true };
}

/**
 * Best effort: a conversation that cannot be saved must not break the answer being read.
 * Takes a client created inside the request: this runs when the stream ends, where cookies()
 * is no longer reachable.
 */
export async function saveExchange(
  supabase: Supabase,
  args: { brand: { id: string; org_id: string }; userId: string; question: string; answer: string; proposal: Proposal | null }
) {
  const base = { org_id: args.brand.org_id, brand_id: args.brand.id, created_by: args.userId };
  const now = Date.now();
  const { error } = await supabase.from("expert_messages").insert([
    { ...base, role: "user", content: args.question, created_at: new Date(now).toISOString() },
    {
      ...base,
      role: "assistant",
      content: args.answer,
      proposal: args.proposal,
      proposal_state: args.proposal ? "pending" : null,
      created_at: new Date(now + 1).toISOString(),
    },
  ]);
  if (error && !isMissingTable(error) && !isForbidden(error)) console.error("[expert] conversation non enregistrée —", error.message);
}

export async function setProposalState(brandId: string, messageId: string, state: ProposalState) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("expert_messages").update({ proposal_state: state }).eq("id", messageId).eq("brand_id", brandId);
  if (error && !isMissingTable(error)) throw error;
}

export async function clearThread(brandId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("expert_messages").delete().eq("brand_id", brandId);
  if (error && !isMissingTable(error)) throw error;
}
