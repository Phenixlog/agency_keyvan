-- 0012_calendar_content.sql — Le calendrier planifie des TUILES, pas des photos
-- Idempotent : peut être rejoué en entier sans risque.
--
-- Chaque publication à créer porte le type de tuile, son accroche et son fond, décidés par le
-- planificateur du mois (damier par canal). Le Studio s'ouvre directement dessus.
-- Sans cette colonne, le code retombe sur l'idée en texte (comportement d'avant).

alter table public.calendar_entries add column if not exists content jsonb;

notify pgrst, 'reload schema';

-- Contrôle : 1 ligne attendue
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'calendar_entries' and column_name = 'content';
