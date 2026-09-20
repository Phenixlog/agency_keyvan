import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type Org = {
  id: string;
  slug: string;
  name: string;
  created_by: string;
};

export async function getOrCreateDefaultOrgForUser(userId: string, email?: string) {
  const hasServiceKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
  );
  // Prefer admin path when available to avoid RLS during bootstrap right after login
  if (hasServiceKey) {
    const admin = createSupabaseAdminClient();
    // 1) Existing membership?
    const { data: memberRows, error: memberErr } = await admin
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1);
    if (memberErr) {
      throw memberErr;
    }
    if (memberRows && memberRows.length > 0) {
      return memberRows[0].org_id as string;
    }
    // 2) Create org (idempotent slug retry)
    const derived = deriveOrgFromEmail(email);
    const { data: orgInsert, error: orgErr } = await admin
      .from("orgs")
      .insert({
        slug: derived.slug,
        name: derived.name,
        created_by: userId,
      })
      .select("id")
      .single();
    if (orgErr) {
      const fallback = deriveOrgFromEmail(email, true);
      const { data: orgInsert2, error: orgErr2 } = await admin
        .from("orgs")
        .insert({
          slug: fallback.slug,
          name: fallback.name,
          created_by: userId,
        })
        .select("id")
        .single();
      if (orgErr2) throw orgErr2;
      const orgId2 = orgInsert2!.id as string;
      await ensureOwnerMembership(orgId2, userId, admin);
      return orgId2;
    }
    const orgId = orgInsert!.id as string;
    await ensureOwnerMembership(orgId, userId, admin);
    return orgId;
  }
  // Fallback (anon RLS path)
  const supabase = await createSupabaseServerClient();

  // 1) Does the user already belong to an org?
  const { data: memberRows, error: memberErr } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  if (memberErr) {
    throw memberErr;
  }
  if (memberRows && memberRows.length > 0) {
    return memberRows[0].org_id as string;
  }

  // 2) Create a new org
  const derived = deriveOrgFromEmail(email);
  const { data: orgInsert, error: orgErr } = await supabase
    .from("orgs")
    .insert({
      slug: derived.slug,
      name: derived.name,
      created_by: userId,
    })
    .select("id")
    .single();
  if (orgErr) {
    // If slug is taken, add suffix and retry once
    const fallback = deriveOrgFromEmail(email, true);
    const { data: orgInsert2, error: orgErr2 } = await supabase
      .from("orgs")
      .insert({
        slug: fallback.slug,
        name: fallback.name,
        created_by: userId,
      })
      .select("id")
      .single();
    if (orgErr2) throw orgErr2;
    const orgId2 = orgInsert2!.id as string;
    await ensureOwnerMembership(orgId2, userId, supabase);
    return orgId2;
  }
  const orgId = orgInsert!.id as string;

  // 3) Create owner membership for the creator
  await ensureOwnerMembership(orgId, userId, supabase);
  return orgId;
}

async function ensureOwnerMembership(orgId: string, userId: string, client?: any) {
  const supabase = client ?? (await createSupabaseServerClient());
  const { error } = await supabase.from("org_members").insert({
    org_id: orgId,
    user_id: userId,
    role: "owner",
    status: "active",
    joined_at: new Date().toISOString(),
  });
  // Ignore "duplicate key" errors to be idempotent
  if (error && !String(error.message || "").includes("duplicate key")) {
    throw error;
  }
}

function deriveOrgFromEmail(email?: string, withSuffix = false) {
  if (!email) {
    const slug = `org-${Math.random().toString(36).slice(2, 6)}`;
    return { slug, name: "Mon organisation" };
  }
  const local = email.split("@")[0] || "org";
  const domain = email.split("@")[1] || "";
  const base =
    (domain.split(".")[0] || local || "org")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "org";
  const slug = withSuffix ? `${base}-${Math.random().toString(36).slice(2, 5)}` : base;
  const name = base.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  return { slug, name };
}

