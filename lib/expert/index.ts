import { isForbidden, isMissingTable } from "@/lib/db-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_HISTORY_MESSAGES, type ChatMessage } from "@/lib/expert/model";

export * from "@/lib/expert/model";

/** Conversational model. Quality matters more than speed here: this is the advice the user pays for. */
export const MODEL_CHAT = process.env.OPENROUTER_MODEL_CHAT || "anthropic/claude-sonnet-5";

/**
 * One continuous thread per brand. `persisted: false` means the table is not there yet
 * (migration pending): the chat still works, it just is not remembered across reloads.
 */
export async function loadThread(brandId: string): Promise<{ messages: ChatMessage[]; persisted: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expert_messages")
    .select("role,content,created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES * 2);
  if (isMissingTable(error)) return { messages: [], persisted: false };
  if (error) throw error;
  return { messages: (data ?? []).reverse().map(({ role, content }) => ({ role, content })) as ChatMessage[], persisted: true };
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Best effort: a conversation that cannot be saved must not break the answer being read.
 * Takes a client created inside the request: this runs when the stream ends, where cookies()
 * is no longer reachable.
 */
export async function saveExchange(
  supabase: Supabase,
  args: { brand: { id: string; org_id: string }; userId: string; question: string; answer: string }
) {
  const base = { org_id: args.brand.org_id, brand_id: args.brand.id, created_by: args.userId };
  const now = Date.now();
  const { error } = await supabase.from("expert_messages").insert([
    { ...base, role: "user", content: args.question, created_at: new Date(now).toISOString() },
    { ...base, role: "assistant", content: args.answer, created_at: new Date(now + 1).toISOString() },
  ]);
  if (error && !isMissingTable(error) && !isForbidden(error)) console.error("[expert] conversation non enregistrée —", error.message);
}

export async function clearThread(brandId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("expert_messages").delete().eq("brand_id", brandId);
  if (error && !isMissingTable(error)) throw error;
}
