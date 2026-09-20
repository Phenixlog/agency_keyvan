-- 0003_fix_org_members_rls.sql — Fix recursion in org_members RLS via helpers
-- Create helper functions that run with SECURITY DEFINER to avoid RLS recursion
-- and then recreate org_members policies to use them.
-- These functions deliberately set search_path to public for safety.

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
  );
$$;

-- Recreate org_members policies to use the helper functions
drop policy if exists org_members_select_member on public.org_members;
create policy org_members_select_member
on public.org_members for select
using (
  public.is_org_member(org_members.org_id) or org_members.user_id = auth.uid()
);

drop policy if exists org_members_insert_admin_or_creator on public.org_members;
create policy org_members_insert_admin_or_creator
on public.org_members for insert
with check (
  public.is_org_admin(org_members.org_id)
  or (
    -- Org creator can create their initial owner/admin membership
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
using (
  public.is_org_admin(org_members.org_id) or org_members.user_id = auth.uid()
);

