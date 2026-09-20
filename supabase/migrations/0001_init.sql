-- 0001_init.sql — Brand OS Sprint 1 (RLS multi-tenant)
-- Extensions
create extension if not exists pgcrypto with schema public;

-- Tables
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,}$'),
  name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('active','invited','suspended')),
  invited_at timestamptz default now(),
  joined_at timestamptz default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members (user_id);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  slug text,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);
create index if not exists brands_org_idx on public.brands (org_id);

create table if not exists public.brand_os_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  version int not null,
  summary text,
  canon jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, version)
);
create index if not exists brand_os_versions_org_idx on public.brand_os_versions (org_id);
create index if not exists brand_os_versions_brand_idx on public.brand_os_versions (brand_id);

create table if not exists public.mega_prompts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  version int default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mega_prompts_org_idx on public.mega_prompts (org_id);
create index if not exists mega_prompts_brand_idx on public.mega_prompts (brand_id);

create table if not exists public.outs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','ready','archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outs_org_idx on public.outs (org_id);
create index if not exists outs_brand_idx on public.outs (brand_id);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  job_type text not null,
  prompt text,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','canceled')),
  output jsonb,
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists jobs_org_idx on public.jobs (org_id);
create index if not exists jobs_brand_idx on public.jobs (brand_id);
create index if not exists jobs_status_idx on public.jobs (status);

create table if not exists public.onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id) on delete set null,
  created_by uuid not null,
  seed text,
  status text not null default 'draft' check (status in ('draft','in_progress','completed','archived')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboarding_sessions_org_idx on public.onboarding_sessions (org_id);
create index if not exists onboarding_sessions_created_by_idx on public.onboarding_sessions (created_by);

-- Updated-at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_brands on public.brands;
create trigger trg_set_updated_at_brands
before update on public.brands
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_brand_os_versions on public.brand_os_versions;
create trigger trg_set_updated_at_brand_os_versions
before update on public.brand_os_versions
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_mega_prompts on public.mega_prompts;
create trigger trg_set_updated_at_mega_prompts
before update on public.mega_prompts
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_outs on public.outs;
create trigger trg_set_updated_at_outs
before update on public.outs
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_jobs on public.jobs;
create trigger trg_set_updated_at_jobs
before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_onboarding on public.onboarding_sessions;
create trigger trg_set_updated_at_onboarding
before update on public.onboarding_sessions
for each row execute function public.set_updated_at();

-- RLS enable
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.brands enable row level security;
alter table public.brand_os_versions enable row level security;
alter table public.mega_prompts enable row level security;
alter table public.outs enable row level security;
alter table public.jobs enable row level security;
alter table public.onboarding_sessions enable row level security;

-- Policies
-- orgs: members can read; owners/admins can update/delete; anyone can create own org
drop policy if exists orgs_select_member on public.orgs;
create policy orgs_select_member
on public.orgs for select
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists orgs_insert_self on public.orgs;
create policy orgs_insert_self
on public.orgs for insert
with check (created_by = auth.uid());

drop policy if exists orgs_update_admin on public.orgs;
create policy orgs_update_admin
on public.orgs for update
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
  )
);

drop policy if exists orgs_delete_owner on public.orgs;
create policy orgs_delete_owner
on public.orgs for delete
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'owner'
  )
);

-- org_members
drop policy if exists org_members_select_member on public.org_members;
create policy org_members_select_member
on public.org_members for select
using (
  exists (
    select 1 from public.org_members m2
    where m2.org_id = org_members.org_id
      and m2.user_id = auth.uid()
      and m2.status = 'active'
  )
);

drop policy if exists org_members_insert_admin_or_creator on public.org_members;
create policy org_members_insert_admin_or_creator
on public.org_members for insert
with check (
  -- Admins can add anyone
  exists (
    select 1 from public.org_members m2
    where m2.org_id = org_members.org_id
      and m2.user_id = auth.uid()
      and m2.status = 'active'
      and m2.role in ('owner','admin')
  )
  or
  -- Org creator can create their initial owner/admin membership
  (
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
using (
  exists (
    select 1 from public.org_members m2
    where m2.org_id = org_members.org_id
      and m2.user_id = auth.uid()
      and m2.status = 'active'
      and m2.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.org_members m2
    where m2.org_id = org_members.org_id
      and m2.user_id = auth.uid()
      and m2.status = 'active'
      and m2.role in ('owner','admin')
  )
);

drop policy if exists org_members_delete_admin_or_self on public.org_members;
create policy org_members_delete_admin_or_self
on public.org_members for delete
using (
  exists (
    select 1 from public.org_members m2
    where m2.org_id = org_members.org_id
      and m2.user_id = auth.uid()
      and m2.status = 'active'
      and m2.role in ('owner','admin')
  )
  or org_members.user_id = auth.uid()
);

-- Helper macro: for all org-scoped tables, allow members
-- brands
drop policy if exists brands_select_member on public.brands;
create policy brands_select_member
on public.brands for select
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = brands.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists brands_insert_member on public.brands;
create policy brands_insert_member
on public.brands for insert
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = brands.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists brands_update_member on public.brands;
create policy brands_update_member
on public.brands for update
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = brands.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = brands.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists brands_delete_member on public.brands;
create policy brands_delete_member
on public.brands for delete
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = brands.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

-- brand_os_versions
drop policy if exists bov_select_member on public.brand_os_versions;
create policy bov_select_member
on public.brand_os_versions for select
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = brand_os_versions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists bov_insert_member on public.brand_os_versions;
create policy bov_insert_member
on public.brand_os_versions for insert
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = brand_os_versions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists bov_update_member on public.brand_os_versions;
create policy bov_update_member
on public.brand_os_versions for update
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = brand_os_versions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = brand_os_versions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists bov_delete_member on public.brand_os_versions;
create policy bov_delete_member
on public.brand_os_versions for delete
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = brand_os_versions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

-- mega_prompts
drop policy if exists mp_select_member on public.mega_prompts;
create policy mp_select_member
on public.mega_prompts for select
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = mega_prompts.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists mp_insert_member on public.mega_prompts;
create policy mp_insert_member
on public.mega_prompts for insert
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = mega_prompts.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists mp_update_member on public.mega_prompts;
create policy mp_update_member
on public.mega_prompts for update
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = mega_prompts.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = mega_prompts.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists mp_delete_member on public.mega_prompts;
create policy mp_delete_member
on public.mega_prompts for delete
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = mega_prompts.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

-- outs
drop policy if exists outs_select_member on public.outs;
create policy outs_select_member
on public.outs for select
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = outs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists outs_insert_member on public.outs;
create policy outs_insert_member
on public.outs for insert
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = outs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists outs_update_member on public.outs;
create policy outs_update_member
on public.outs for update
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = outs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = outs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists outs_delete_member on public.outs;
create policy outs_delete_member
on public.outs for delete
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = outs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

-- jobs
drop policy if exists jobs_select_member on public.jobs;
create policy jobs_select_member
on public.jobs for select
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = jobs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists jobs_insert_member on public.jobs;
create policy jobs_insert_member
on public.jobs for insert
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = jobs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists jobs_update_member on public.jobs;
create policy jobs_update_member
on public.jobs for update
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = jobs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = jobs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists jobs_delete_member on public.jobs;
create policy jobs_delete_member
on public.jobs for delete
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = jobs.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

-- onboarding_sessions (allow creator access even without org)
drop policy if exists ob_select_member_or_creator on public.onboarding_sessions;
create policy ob_select_member_or_creator
on public.onboarding_sessions for select
using (
  (org_id is not null and exists (
    select 1 from public.org_members m
    where m.org_id = onboarding_sessions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ))
  or (created_by = auth.uid())
);

drop policy if exists ob_insert_member_or_self on public.onboarding_sessions;
create policy ob_insert_member_or_self
on public.onboarding_sessions for insert
with check (
  (org_id is not null and exists (
    select 1 from public.org_members m
    where m.org_id = onboarding_sessions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ))
  or (created_by = auth.uid())
);

drop policy if exists ob_update_member_or_creator on public.onboarding_sessions;
create policy ob_update_member_or_creator
on public.onboarding_sessions for update
using (
  (org_id is not null and exists (
    select 1 from public.org_members m
    where m.org_id = onboarding_sessions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ))
  or (created_by = auth.uid())
)
with check (
  (org_id is not null and exists (
    select 1 from public.org_members m
    where m.org_id = onboarding_sessions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ))
  or (created_by = auth.uid())
);

drop policy if exists ob_delete_member_or_creator on public.onboarding_sessions;
create policy ob_delete_member_or_creator
on public.onboarding_sessions for delete
using (
  (org_id is not null and exists (
    select 1 from public.org_members m
    where m.org_id = onboarding_sessions.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ))
  or (created_by = auth.uid())
);


