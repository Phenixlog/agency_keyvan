-- 0006_brand_shares.sql — Lien public (lecture seule) vers la planche de marque
-- Idempotent : peut être rejoué en entier sans risque.
-- Dépend de 0004 (fonction public.is_active_org_member).
--
-- Le lien est le seul secret : un jeton aléatoire de 32 octets. Aucune politique n'ouvre la table
-- aux visiteurs anonymes : la page publique lit par le jeton côté serveur (clé de service), et
-- n'expose que la planche — ni les règles, ni l'historique, ni les conversations.

create table if not exists public.brand_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  token text not null unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists brand_shares_brand_idx on public.brand_shares (brand_id) where revoked_at is null;

alter table public.brand_shares enable row level security;
grant select, insert, update on public.brand_shares to authenticated;
revoke all on public.brand_shares from anon;

drop policy if exists brand_shares_select_member on public.brand_shares;
create policy brand_shares_select_member on public.brand_shares for select
using (public.is_active_org_member(brand_shares.org_id));

drop policy if exists brand_shares_insert_member on public.brand_shares;
create policy brand_shares_insert_member on public.brand_shares for insert
with check (public.is_active_org_member(brand_shares.org_id));

drop policy if exists brand_shares_update_member on public.brand_shares;
create policy brand_shares_update_member on public.brand_shares for update
using (public.is_active_org_member(brand_shares.org_id))
with check (public.is_active_org_member(brand_shares.org_id));

-- Contrôle : doit renvoyer 3 lignes.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'brand_shares'
order by cmd;
