-- 0004_calendar_playbooks.sql — Calendrier éditorial + playbooks Expert
-- Idempotent : peut être rejoué sans risque, en entier.
-- L'appartenance à l'organisation passe par public.is_org_member() (SECURITY DEFINER, cf. 0003) :
-- une sous-requête directe sur org_members dépendrait des politiques RLS de cette table.

-- ---------------------------------------------------------------------------
-- Calendrier : une création (ou une simple idée) planifiée sur un canal, un jour donné.
-- Pas de publication automatique : c'est un planning, pas un connecteur social.
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  out_id uuid references public.outs(id) on delete set null,
  scheduled_on date not null,
  channel text not null check (channel in ('instagram','linkedin','facebook','tiktok','x','newsletter','print','autre')),
  caption text,
  status text not null default 'planned' check (status in ('planned','published','canceled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_entries_brand_day_idx on public.calendar_entries (brand_id, scheduled_on);
create index if not exists calendar_entries_org_idx on public.calendar_entries (org_id);

-- ---------------------------------------------------------------------------
-- Playbooks : guides pratiques tirés du Brand OS. Un seul par marque et par type,
-- remplacé à chaque régénération ; os_version dit de quelle version il provient.
-- ---------------------------------------------------------------------------
create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind text not null check (kind in ('editorial','voice','visual')),
  content jsonb not null default '{}'::jsonb,
  os_version integer not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, kind)
);
create index if not exists playbooks_org_idx on public.playbooks (org_id);

-- updated_at (fonction créée par 0001)
drop trigger if exists trg_set_updated_at_calendar_entries on public.calendar_entries;
create trigger trg_set_updated_at_calendar_entries
before update on public.calendar_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_playbooks on public.playbooks;
create trigger trg_set_updated_at_playbooks
before update on public.playbooks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS : lecture et écriture réservées aux membres actifs de l'organisation.
-- ---------------------------------------------------------------------------
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

alter table public.calendar_entries enable row level security;
alter table public.playbooks enable row level security;

grant select, insert, update, delete on public.calendar_entries to authenticated;
grant select, insert, update, delete on public.playbooks to authenticated;

drop policy if exists calendar_entries_select_member on public.calendar_entries;
create policy calendar_entries_select_member on public.calendar_entries for select
using (public.is_org_member(calendar_entries.org_id));

drop policy if exists calendar_entries_insert_member on public.calendar_entries;
create policy calendar_entries_insert_member on public.calendar_entries for insert
with check (public.is_org_member(calendar_entries.org_id));

drop policy if exists calendar_entries_update_member on public.calendar_entries;
create policy calendar_entries_update_member on public.calendar_entries for update
using (public.is_org_member(calendar_entries.org_id))
with check (public.is_org_member(calendar_entries.org_id));

drop policy if exists calendar_entries_delete_member on public.calendar_entries;
create policy calendar_entries_delete_member on public.calendar_entries for delete
using (public.is_org_member(calendar_entries.org_id));

drop policy if exists playbooks_select_member on public.playbooks;
create policy playbooks_select_member on public.playbooks for select
using (public.is_org_member(playbooks.org_id));

drop policy if exists playbooks_insert_member on public.playbooks;
create policy playbooks_insert_member on public.playbooks for insert
with check (public.is_org_member(playbooks.org_id));

drop policy if exists playbooks_update_member on public.playbooks;
create policy playbooks_update_member on public.playbooks for update
using (public.is_org_member(playbooks.org_id))
with check (public.is_org_member(playbooks.org_id));

drop policy if exists playbooks_delete_member on public.playbooks;
create policy playbooks_delete_member on public.playbooks for delete
using (public.is_org_member(playbooks.org_id));

-- Contrôle : doit renvoyer 8 lignes (4 politiques par table).
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('calendar_entries', 'playbooks')
order by tablename, cmd;
