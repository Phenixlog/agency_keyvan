-- 0009_calendar_planning.sql — Planning proposé par Brand OS + validation par le client final
-- Idempotent : peut être rejoué en entier sans risque. Dépend de 0004 (calendar_entries, is_active_org_member).
-- 0004 est appliquée et figée : tout ce qui change dans le calendrier est ici.

-- ---------------------------------------------------------------------------
-- 1. Une publication peut être « proposée » (suggérée par Brand OS, en attente d'un oui).
-- ---------------------------------------------------------------------------
alter table public.calendar_entries drop constraint if exists calendar_entries_status_check;
alter table public.calendar_entries
  add constraint calendar_entries_status_check check (status in ('proposed','planned','published','canceled'));

-- ---------------------------------------------------------------------------
-- 2. Ce que porte une publication en plus : l'angle servi, le visuel qui reste à créer,
--    et l'avis du client final (donné par le lien public, jamais par un compte).
-- ---------------------------------------------------------------------------
alter table public.calendar_entries add column if not exists angle text;
alter table public.calendar_entries add column if not exists idea text;
alter table public.calendar_entries add column if not exists client_status text not null default 'pending';
alter table public.calendar_entries add column if not exists client_comment text;
alter table public.calendar_entries add column if not exists client_reviewed_at timestamptz;

alter table public.calendar_entries drop constraint if exists calendar_entries_client_status_check;
alter table public.calendar_entries
  add constraint calendar_entries_client_status_check check (client_status in ('pending','approved','changes'));

-- ---------------------------------------------------------------------------
-- 3. Lien public de validation du planning. Même principe que brand_shares (0006) : le jeton
--    de 32 octets est le seul secret, aucune politique n'ouvre quoi que ce soit aux anonymes ;
--    la page publique lit et écrit par le jeton côté serveur (clé de service), et ne touche
--    qu'aux trois colonnes client_* des publications planifiées de cette marque.
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  token text not null unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists calendar_shares_brand_idx on public.calendar_shares (brand_id) where revoked_at is null;

alter table public.calendar_shares enable row level security;
grant select, insert, update on public.calendar_shares to authenticated;
revoke all on public.calendar_shares from anon;

drop policy if exists calendar_shares_select_member on public.calendar_shares;
create policy calendar_shares_select_member on public.calendar_shares for select
using (public.is_active_org_member(calendar_shares.org_id));

drop policy if exists calendar_shares_insert_member on public.calendar_shares;
create policy calendar_shares_insert_member on public.calendar_shares for insert
with check (public.is_active_org_member(calendar_shares.org_id));

drop policy if exists calendar_shares_update_member on public.calendar_shares;
create policy calendar_shares_update_member on public.calendar_shares for update
using (public.is_active_org_member(calendar_shares.org_id))
with check (public.is_active_org_member(calendar_shares.org_id));

-- Contrôle : doit renvoyer 8 lignes (5 colonnes ajoutées + 3 politiques du lien public).
select 'colonne' as quoi, column_name as nom from information_schema.columns
where table_schema = 'public' and table_name = 'calendar_entries'
  and column_name in ('angle','idea','client_status','client_comment','client_reviewed_at')
union all
select 'politique', policyname from pg_policies
where schemaname = 'public' and tablename = 'calendar_shares'
order by 1, 2;
