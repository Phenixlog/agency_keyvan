-- 0004_calendar_expert.sql — Calendrier éditorial + conversation avec l'expert de marque
-- Idempotent : peut être rejoué sans risque, en entier.
-- L'appartenance à l'organisation passe par public.is_active_org_member() (SECURITY DEFINER) :
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
-- Expert : une conversation continue par marque. Chaque message est une ligne, jamais modifiée.
-- ---------------------------------------------------------------------------
create table if not exists public.expert_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists expert_messages_brand_time_idx on public.expert_messages (brand_id, created_at);

-- Une première version de cette migration créait une table « playbooks », restée vide et
-- abandonnée depuis (l'Expert est devenu conversationnel). On la retire si elle existe.
drop table if exists public.playbooks;

-- updated_at (fonction créée par 0001)
drop trigger if exists trg_set_updated_at_calendar_entries on public.calendar_entries;
create trigger trg_set_updated_at_calendar_entries
before update on public.calendar_entries
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS : lecture et écriture réservées aux membres actifs de l'organisation.
-- ---------------------------------------------------------------------------
-- Fonction propre à cette migration, au nom volontairement inédit. La production a déjà un
-- public.is_org_member() dont la signature diffère selon les environnements : « create or replace »
-- échoue dessus (42P13), et la supprimer casserait les politiques qui en dépendent. On n'y touche pas.
create or replace function public.is_active_org_member(target_org_id uuid)
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
alter table public.expert_messages enable row level security;

grant select, insert, update, delete on public.calendar_entries to authenticated;
grant select, insert, delete on public.expert_messages to authenticated;

drop policy if exists calendar_entries_select_member on public.calendar_entries;
create policy calendar_entries_select_member on public.calendar_entries for select
using (public.is_active_org_member(calendar_entries.org_id));

drop policy if exists calendar_entries_insert_member on public.calendar_entries;
create policy calendar_entries_insert_member on public.calendar_entries for insert
with check (public.is_active_org_member(calendar_entries.org_id));

drop policy if exists calendar_entries_update_member on public.calendar_entries;
create policy calendar_entries_update_member on public.calendar_entries for update
using (public.is_active_org_member(calendar_entries.org_id))
with check (public.is_active_org_member(calendar_entries.org_id));

drop policy if exists calendar_entries_delete_member on public.calendar_entries;
create policy calendar_entries_delete_member on public.calendar_entries for delete
using (public.is_active_org_member(calendar_entries.org_id));

drop policy if exists expert_messages_select_member on public.expert_messages;
create policy expert_messages_select_member on public.expert_messages for select
using (public.is_active_org_member(expert_messages.org_id));

drop policy if exists expert_messages_insert_member on public.expert_messages;
create policy expert_messages_insert_member on public.expert_messages for insert
with check (public.is_active_org_member(expert_messages.org_id));

drop policy if exists expert_messages_delete_member on public.expert_messages;
create policy expert_messages_delete_member on public.expert_messages for delete
using (public.is_active_org_member(expert_messages.org_id));

-- Contrôle : doit renvoyer 7 lignes (4 politiques pour calendar_entries, 3 pour expert_messages).
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('calendar_entries', 'expert_messages')
order by tablename, cmd;
