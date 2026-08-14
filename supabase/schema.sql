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
on conflict (id) do update set public = false;

drop policy if exists "family recipe images read" on storage.objects;

drop policy if exists "family recipe images insert" on storage.objects;

drop policy if exists "family recipe images update" on storage.objects;

drop policy if exists "family recipe images delete" on storage.objects;

create extension if not exists pgcrypto;

create table if not exists public.family_profiles (
  id uuid primary key default gen_random_uuid(),
  login_code text not null unique,
  display_name text not null,
  role text not null check (role in ('admin', 'member')),
  family_id text not null default 'family-main',
  pin_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.family_profiles enable row level security;
revoke all on public.family_profiles from anon, authenticated;

create table if not exists public.recipes (
  id text primary key,
  name text not null,
  categories jsonb not null default '[]'::jsonb,
  ingredients jsonb not null default '[]'::jsonb,
  seasonings jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  tips text not null default '',
  notes jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  favorite_user_ids jsonb not null default '[]'::jsonb,
  cook_records jsonb not null default '[]'::jsonb,
  cook_count integer not null default 0,
  last_cooked_at timestamptz,
  image_id text,
  image_version text,
  author_user_id uuid not null references public.family_profiles(id) on delete restrict,
  author_name text not null,
  family_id text not null default 'family-main',
  is_family_shared boolean not null default false,
  created_by_role text not null default 'admin',
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

alter table public.recipes enable row level security;
revoke all on public.recipes from anon, authenticated;

create index if not exists recipes_family_idx on public.recipes (family_id, created_at desc);
create index if not exists recipes_author_idx on public.recipes (author_user_id);
create index if not exists recipes_shared_idx on public.recipes (family_id, is_family_shared);
create index if not exists recipes_image_idx on public.recipes (image_id);
create index if not exists recipes_last_cooked_idx on public.recipes (family_id, last_cooked_at desc);
create index if not exists recipes_cook_count_idx on public.recipes (family_id, cook_count desc);

create table if not exists public.guest_comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null references public.recipes(id) on delete cascade,
  guest_name text not null,
  content text not null,
  created_at timestamptz not null default now(),
  ip_hash text,
  user_agent_hash text
);

alter table public.guest_comments enable row level security;
revoke all on public.guest_comments from anon, authenticated;

create index if not exists guest_comments_recipe_idx on public.guest_comments (recipe_id, created_at desc);

create table if not exists public.recipe_cook_events (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null references public.recipes(id) on delete cascade,
  family_id text not null,
  user_id uuid references public.family_profiles(id) on delete set null,
  cooked_on date not null,
  source text not null check (source in ('initial_image_baseline', 'recipe_created_with_image', 'legacy_cook_record', 'manual')),
  created_at timestamptz not null default now()
);

alter table public.recipe_cook_events enable row level security;
revoke all on public.recipe_cook_events from anon, authenticated;
create index if not exists recipe_cook_events_family_date_idx on public.recipe_cook_events (family_id, cooked_on desc);
create index if not exists recipe_cook_events_recipe_date_idx on public.recipe_cook_events (recipe_id, cooked_on desc);
create unique index if not exists recipe_cook_events_baseline_once_idx on public.recipe_cook_events (recipe_id) where source in ('initial_image_baseline', 'recipe_created_with_image');
create unique index if not exists recipe_cook_events_manual_daily_idx on public.recipe_cook_events (recipe_id, cooked_on) where source = 'manual';
create unique index if not exists recipe_cook_events_legacy_dedupe_idx on public.recipe_cook_events (recipe_id, cooked_on, source, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), created_at) where source = 'legacy_cook_record';

create table if not exists public.recipe_cook_event_migration_audit (
  migration_key text primary key,
  recipe_total integer not null,
  image_recipe_total integer not null,
  legacy_record_total integer not null,
  baseline_created integer not null,
  created_at timestamptz not null default now()
);
alter table public.recipe_cook_event_migration_audit enable row level security;
revoke all on public.recipe_cook_event_migration_audit from anon, authenticated;
