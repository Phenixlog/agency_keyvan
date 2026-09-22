-- 0010_expert_conversations.sql — L'expert : conversations séparées par client, historique, bilans
-- Idempotent : peut être rejoué en entier sans risque. Dépend de 0005 (expert_messages) et 0004 (is_active_org_member).
--
-- Une conversation = un sujet (ou un bilan). Les messages existants sont rattachés à une
-- « Conversation d'origine » par marque : rien n'est perdu.

create table if not exists public.expert_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  title text,
  kind text not null default 'chat' check (kind in ('chat','bilan')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists expert_conversations_brand_idx on public.expert_conversations (brand_id, updated_at desc) where archived_at is null;

alter table public.expert_conversations enable row level security;
grant select, insert, update, delete on public.expert_conversations to authenticated;

drop policy if exists expert_conversations_select_member on public.expert_conversations;
create policy expert_conversations_select_member on public.expert_conversations for select
using (public.is_active_org_member(expert_conversations.org_id));

drop policy if exists expert_conversations_insert_member on public.expert_conversations;
create policy expert_conversations_insert_member on public.expert_conversations for insert
with check (public.is_active_org_member(expert_conversations.org_id));

drop policy if exists expert_conversations_update_member on public.expert_conversations;
create policy expert_conversations_update_member on public.expert_conversations for update
using (public.is_active_org_member(expert_conversations.org_id))
with check (public.is_active_org_member(expert_conversations.org_id));

drop policy if exists expert_conversations_delete_member on public.expert_conversations;
create policy expert_conversations_delete_member on public.expert_conversations for delete
using (public.is_active_org_member(expert_conversations.org_id));

-- Les messages : leur conversation, les créations que l'expert a regardées (id + image),
-- et, pour une proposition appliquée, les versions créées.
alter table public.expert_messages add column if not exists conversation_id uuid references public.expert_conversations(id) on delete cascade;
alter table public.expert_messages add column if not exists creations jsonb;
alter table public.expert_messages add column if not exists applied_os_version integer;
alter table public.expert_messages add column if not exists applied_mega_version integer;
create index if not exists expert_messages_conversation_idx on public.expert_messages (conversation_id, created_at);

-- Rattachement des messages existants : une conversation d'origine par marque.
do $$
declare
  b record;
  c uuid;
begin
  for b in
    select distinct brand_id, org_id from public.expert_messages where conversation_id is null
  loop
    insert into public.expert_conversations (org_id, brand_id, title, kind)
    values (b.org_id, b.brand_id, 'Conversation d''origine', 'chat')
    returning id into c;
    update public.expert_messages set conversation_id = c where brand_id = b.brand_id and conversation_id is null;
    update public.expert_conversations
      set updated_at = coalesce((select max(created_at) from public.expert_messages where conversation_id = c), now())
      where id = c;
  end loop;
end $$;

-- Contrôle : doit renvoyer 8 lignes (4 politiques + 4 colonnes).
select 'politique' as quoi, policyname as nom from pg_policies
where schemaname = 'public' and tablename = 'expert_conversations'
union all
select 'colonne', column_name from information_schema.columns
where table_schema = 'public' and table_name = 'expert_messages'
  and column_name in ('conversation_id','creations','applied_os_version','applied_mega_version')
order by 1, 2;
