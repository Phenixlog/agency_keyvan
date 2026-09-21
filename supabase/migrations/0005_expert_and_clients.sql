-- 0005_expert_and_clients.sql — Conversation avec l'expert + archivage des clients
-- Idempotent : peut être rejoué en entier sans risque.
-- Dépend de 0004 (fonction public.is_active_org_member).

-- ---------------------------------------------------------------------------
-- Expert : une conversation continue par marque. Le texte d'un message ne change jamais ;
-- seul l'état de sa proposition évolue (en attente → appliquée ou écartée).
-- ---------------------------------------------------------------------------
create table if not exists public.expert_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  -- Changement du Brand OS / mega-prompt proposé par l'expert dans ce message, et ce qu'on en a fait.
  proposal jsonb,
  proposal_state text check (proposal_state in ('pending','applied','dismissed')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists expert_messages_brand_time_idx on public.expert_messages (brand_id, created_at);

alter table public.expert_messages enable row level security;
grant select, insert, update, delete on public.expert_messages to authenticated;

drop policy if exists expert_messages_select_member on public.expert_messages;
create policy expert_messages_select_member on public.expert_messages for select
using (public.is_active_org_member(expert_messages.org_id));

drop policy if exists expert_messages_insert_member on public.expert_messages;
create policy expert_messages_insert_member on public.expert_messages for insert
with check (public.is_active_org_member(expert_messages.org_id));

drop policy if exists expert_messages_update_member on public.expert_messages;
create policy expert_messages_update_member on public.expert_messages for update
using (public.is_active_org_member(expert_messages.org_id))
with check (public.is_active_org_member(expert_messages.org_id));

drop policy if exists expert_messages_delete_member on public.expert_messages;
create policy expert_messages_delete_member on public.expert_messages for delete
using (public.is_active_org_member(expert_messages.org_id));

-- Une première version de 0004 créait une table « playbooks », restée vide et abandonnée
-- (l'Expert est devenu conversationnel). On la retire si elle existe.
drop table if exists public.playbooks;

-- ---------------------------------------------------------------------------
-- Clients : un client archivé disparaît de l'atelier sans rien perdre (créations, Brand OS,
-- conversation) et peut être restauré.
-- ---------------------------------------------------------------------------
alter table public.brands add column if not exists archived_at timestamptz;
create index if not exists brands_active_idx on public.brands (org_id) where archived_at is null;

-- Contrôle : doit renvoyer 5 lignes (4 politiques + la colonne archived_at).
select 'politique' as quoi, policyname as nom from pg_policies
where schemaname = 'public' and tablename = 'expert_messages'
union all
select 'colonne', column_name from information_schema.columns
where table_schema = 'public' and table_name = 'brands' and column_name = 'archived_at'
order by 1, 2;
