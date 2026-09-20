-- Fix RLS recursion on org_members by using SECURITY DEFINER helper functions
-- and add creator SELECT access on orgs.
--
-- This migration is idempotent and safe to apply once.

-- Helper functions
create or replace function public.is_org_member(p_org_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = coalesce(p_user_id, auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = coalesce(p_user_id, auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin')
  );
$$;

-- Recreate org_members policies using helpers (non-recursive)
drop policy if exists org_members_select_member on public.org_members;
create policy org_members_select_member
on public.org_members for select
using ( public.is_org_member(org_members.org_id) );

drop policy if exists org_members_insert_admin_or_creator on public.org_members;
create policy org_members_insert_admin_or_creator
on public.org_members for insert
with check (
  public.is_org_admin(org_members.org_id)
  or (
    org_members.user_id = auth.uid()
    and org_members.role in ('owner','admin')
    and exists (
      select 1 from public.orgs o
      where o.id = org_members.org_id
        and o.created_by = auth.uid()
    )
  )
);

drop policy if exists org_members_update_admin on public.org_members;
create policy org_members_update_admin
on public.org_members for update
using ( public.is_org_admin(org_members.org_id) )
with check ( public.is_org_admin(org_members.org_id) );

drop policy if exists org_members_delete_admin_or_self on public.org_members;
create policy org_members_delete_admin_or_self
on public.org_members for delete
using ( public.is_org_admin(org_members.org_id) or org_members.user_id = auth.uid() );

-- Optional convenience: allow creators to see their org even before membership exists
drop policy if exists orgs_select_creator on public.orgs;
create policy orgs_select_creator
on public.orgs for select
using ( created_by = auth.uid() );

