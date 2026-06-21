create table if not exists public.family_recipe_library (
  id text primary key,
  recipes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.family_recipe_library enable row level security;

drop policy if exists "family recipes read" on public.family_recipe_library;
create policy "family recipes read" on public.family_recipe_library for select to anon using (true);

drop policy if exists "family recipes insert" on public.family_recipe_library;
create policy "family recipes insert" on public.family_recipe_library for insert to anon with check (id = 'main');

drop policy if exists "family recipes update" on public.family_recipe_library;
create policy "family recipes update" on public.family_recipe_library for update to anon using (id = 'main') with check (id = 'main');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = true;

drop policy if exists "family recipe images read" on storage.objects;
create policy "family recipe images read" on storage.objects for select to anon using (bucket_id = 'recipe-images');

drop policy if exists "family recipe images insert" on storage.objects;
create policy "family recipe images insert" on storage.objects for insert to anon with check (bucket_id = 'recipe-images');

drop policy if exists "family recipe images update" on storage.objects;
create policy "family recipe images update" on storage.objects for update to anon using (bucket_id = 'recipe-images') with check (bucket_id = 'recipe-images');

drop policy if exists "family recipe images delete" on storage.objects;
create policy "family recipe images delete" on storage.objects for delete to anon using (bucket_id = 'recipe-images');
