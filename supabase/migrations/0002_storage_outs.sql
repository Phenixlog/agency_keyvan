-- 0002_storage_outs.sql — Storage bucket for generated outs
-- Create public bucket "outs" if it doesn't exist
insert into storage.buckets (id, name, public)
values ('outs', 'outs', true)
on conflict (id) do nothing;

-- Enable RLS on storage.objects if not already enabled (usually enabled by default)
alter table if exists storage.objects enable row level security;

-- Policies for bucket "outs"
-- Public read for all objects in bucket "outs"
drop policy if exists "outs_public_read" on storage.objects;
create policy "outs_public_read"
on storage.objects for select
using (bucket_id = 'outs');

-- Allow authenticated users to upload to bucket "outs"
drop policy if exists "outs_authenticated_insert" on storage.objects;
create policy "outs_authenticated_insert"
on storage.objects for insert
with check (bucket_id = 'outs' and auth.uid() is not null);

-- Allow owners to update/delete their own objects (best-effort; owner may be null if uploaded via service key)
drop policy if exists "outs_owner_update" on storage.objects;
create policy "outs_owner_update"
on storage.objects for update
using (bucket_id = 'outs' and (owner = auth.uid() or auth.role() = 'service_role'))
with check (bucket_id = 'outs' and (owner = auth.uid() or auth.role() = 'service_role'));

drop policy if exists "outs_owner_delete" on storage.objects;
create policy "outs_owner_delete"
on storage.objects for delete
using (bucket_id = 'outs' and (owner = auth.uid() or auth.role() = 'service_role'));

