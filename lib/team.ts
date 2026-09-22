import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDefaultOrgForUser } from "@/lib/orgs";

/**
 * The people of an organisation. Membership is one row in org_members; the e-mail lives in auth.
 * Inviting someone creates their account through Supabase (they receive the invitation e-mail) and
 * their membership at once, so their first login lands in this organisation and not in a new one.
 */
export type Member = { userId: string; email: string; role: string; status: string; joinedAt: string | null };

const ROLES_THAT_INVITE = ["owner", "admin"];

export async function getTeam(user: { id: string; email?: string | null }): Promise<{ orgId: string; me: Member | null; members: Member[] }> {
  const orgId = await getOrCreateDefaultOrgForUser(user.id, user.email ?? undefined);
  const admin = createSupabaseAdminClient();
  const { data: rows } = await admin.from("org_members").select("user_id,role,status,joined_at").eq("org_id", orgId).order("joined_at", { ascending: true });
  const emails = await emailsOf(admin, (rows ?? []).map((r) => r.user_id as string));
  const members: Member[] = (rows ?? []).map((r) => ({ userId: r.user_id as string, email: emails.get(r.user_id as string) ?? "", role: r.role as string, status: r.status as string, joinedAt: (r.joined_at as string | null) ?? null }));
  return { orgId, me: members.find((m) => m.userId === user.id) ?? null, members };
}

async function emailsOf(admin: ReturnType<typeof createSupabaseAdminClient>, userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user?.email) map.set(id, data.user.email);
    })
  );
  return map;
}

export type InviteResult = { ok: boolean; message: string };

export async function inviteMember(args: { by: { id: string; email?: string | null }; email: string; origin: string }): Promise<InviteResult> {
  const email = args.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Adresse e-mail invalide." };
  const { orgId, me, members } = await getTeam(args.by);
  if (!me || !ROLES_THAT_INVITE.includes(me.role)) return { ok: false, message: "Seul le propriétaire de l’organisation peut inviter." };
  if (members.some((m) => m.email === email)) return { ok: false, message: "Cette personne fait déjà partie de l’équipe." };

  const admin = createSupabaseAdminClient();
  // New account: Supabase sends the invitation e-mail; the link comes back to /auth/callback with a session.
  let userId: string | null = null;
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${args.origin}/auth/callback` });
  if (!invited.error && invited.data?.user) userId = invited.data.user.id;
  else {
    // Already registered: no e-mail is sent by Supabase in that case, the membership is enough.
    const existing = await findUserByEmail(admin, email);
    if (!existing) return { ok: false, message: `Invitation impossible : ${invited.error?.message ?? "compte introuvable"}.` };
    userId = existing;
  }
  const { error } = await admin.from("org_members").insert({ org_id: orgId, user_id: userId, role: "member", status: "active", joined_at: new Date().toISOString() });
  if (error && !String(error.message || "").includes("duplicate key")) return { ok: false, message: `Invitation impossible : ${error.message}` };
  return {
    ok: true,
    message: invited.error
      ? `${email} avait déjà un compte : il fait maintenant partie de l’équipe et peut se connecter par lien magique.`
      : `Invitation envoyée à ${email}. Le lien reçu ouvre directement l’atelier ; ensuite, connexion par lien magique.`,
  };
}

async function findUserByEmail(admin: ReturnType<typeof createSupabaseAdminClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function removeMember(args: { by: { id: string; email?: string | null }; userId: string }): Promise<InviteResult> {
  const { orgId, me, members } = await getTeam(args.by);
  if (!me || !ROLES_THAT_INVITE.includes(me.role)) return { ok: false, message: "Seul le propriétaire de l’organisation peut retirer quelqu’un." };
  const target = members.find((m) => m.userId === args.userId);
  if (!target) return { ok: false, message: "Membre introuvable." };
  if (target.role === "owner") return { ok: false, message: "Le propriétaire ne peut pas être retiré." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("org_members").delete().eq("org_id", orgId).eq("user_id", args.userId);
  return error ? { ok: false, message: error.message } : { ok: true, message: `${target.email || "Ce membre"} ne fait plus partie de l’équipe.` };
}
