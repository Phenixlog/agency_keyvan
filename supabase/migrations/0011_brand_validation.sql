-- 0011_brand_validation.sql — Un client s'onboarde, on valide son Brand OS, ENSUITE on produit
-- Idempotent : peut être rejoué en entier sans risque.
--
-- Tant que brands.validated_at est vide, le Studio et le Calendrier sont fermés pour ce client
-- (règle de Keyvan : « sans validation → aucun moteur »). Les marques qui existent déjà et ont
-- un Brand OS sont validées d'office : rien ne se ferme pour les clients en cours.

alter table public.brands add column if not exists validated_at timestamptz;

update public.brands b
set validated_at = coalesce(b.validated_at, now())
where b.validated_at is null
  and exists (select 1 from public.brand_os_versions v where v.brand_id = b.id);

-- Contrôle : doit renvoyer 1 ligne.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'brands' and column_name = 'validated_at';
