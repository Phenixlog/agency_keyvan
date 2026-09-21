-- 0007_brand_assets.sql — Photothèque du client : ses vrais produits, lieux, équipe
-- Idempotent : peut être rejoué en entier sans risque.
-- Dépend de 0004 (fonction public.is_active_org_member).
--
-- Les fichiers vont dans le bucket Storage « outs » (déjà en place, lecture publique : le modèle
-- d'image doit pouvoir les télécharger), sous brands/<brand_id>/references/. Cette table dit ce que
-- chaque photo montre : c'est ce libellé qui permet de demander « la tasse Lune » et pas « une tasse ».

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  storage_path text not null unique,
  label text not null,
  kind text not null default 'product' check (kind in ('product','place','people','other')),
  created_by uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists brand_assets_brand_idx on public.brand_assets (brand_id) where archived_at is null;

alter table public.brand_assets enable row level security;
grant select, insert, update on public.brand_assets to authenticated;

drop policy if exists brand_assets_select_member on public.brand_assets;
create policy brand_assets_select_member on public.brand_assets for select
using (public.is_active_org_member(brand_assets.org_id));

drop policy if exists brand_assets_insert_member on public.brand_assets;
create policy brand_assets_insert_member on public.brand_assets for insert
with check (public.is_active_org_member(brand_assets.org_id));

drop policy if exists brand_assets_update_member on public.brand_assets;
create policy brand_assets_update_member on public.brand_assets for update
using (public.is_active_org_member(brand_assets.org_id))
with check (public.is_active_org_member(brand_assets.org_id));

-- Contrôle : doit renvoyer 3 lignes.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'brand_assets'
order by cmd;
