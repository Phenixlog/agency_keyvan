-- 0008_medium_briefs.sql — Fiches d'expertise des supports (tee-shirt, bâche, story, étiquette…)
-- Idempotent : peut être rejoué en entier sans risque.
-- Dépend de 0004 (fonction public.is_active_org_member).
--
-- Une fiche est rédigée par le modèle d'analyse à la première utilisation d'un support, puis
-- réutilisée. Elle est rangée par organisation : ce qu'écrit un compte ne peut pas influencer
-- les générations d'un autre.

create table if not exists public.medium_briefs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  -- Clé du catalogue (« poster »), ou support sur mesure normalisé (« custom:etiquette de pot de miel:3:4 »).
  medium_key text not null,
  label text not null,
  content jsonb not null,
  model text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, medium_key)
);

drop trigger if exists trg_set_updated_at_medium_briefs on public.medium_briefs;
create trigger trg_set_updated_at_medium_briefs
before update on public.medium_briefs
for each row execute function public.set_updated_at();

alter table public.medium_briefs enable row level security;
grant select, insert, update on public.medium_briefs to authenticated;

drop policy if exists medium_briefs_select_member on public.medium_briefs;
create policy medium_briefs_select_member on public.medium_briefs for select
using (public.is_active_org_member(medium_briefs.org_id));

drop policy if exists medium_briefs_insert_member on public.medium_briefs;
create policy medium_briefs_insert_member on public.medium_briefs for insert
with check (public.is_active_org_member(medium_briefs.org_id));

drop policy if exists medium_briefs_update_member on public.medium_briefs;
create policy medium_briefs_update_member on public.medium_briefs for update
using (public.is_active_org_member(medium_briefs.org_id))
with check (public.is_active_org_member(medium_briefs.org_id));

-- Contrôle : doit renvoyer 3 lignes.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'medium_briefs'
order by cmd;
