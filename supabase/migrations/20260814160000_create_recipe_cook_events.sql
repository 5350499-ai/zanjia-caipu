-- Phase 7.2: auditable cooking events and monthly ranking baseline.
-- Existing recipes/cook_records remain untouched; this migration only adds
-- event rows and refreshes the legacy compatibility counter from those rows.

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

create index if not exists recipe_cook_events_family_date_idx
  on public.recipe_cook_events (family_id, cooked_on desc);
create index if not exists recipe_cook_events_recipe_date_idx
  on public.recipe_cook_events (recipe_id, cooked_on desc);
create unique index if not exists recipe_cook_events_baseline_once_idx
  on public.recipe_cook_events (recipe_id)
  where source in ('initial_image_baseline', 'recipe_created_with_image');
create unique index if not exists recipe_cook_events_manual_daily_idx
  on public.recipe_cook_events (recipe_id, user_id, cooked_on)
  where source = 'manual' and user_id is not null;
create unique index if not exists recipe_cook_events_legacy_dedupe_idx
  on public.recipe_cook_events (recipe_id, cooked_on, source, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), created_at)
  where source = 'legacy_cook_record';

-- Keep an aggregate audit snapshot without changing any recipe content.
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

-- Map existing JSON cook records first. Existing records are never discarded.
insert into public.recipe_cook_events (recipe_id, family_id, user_id, cooked_on, source, created_at)
select
  r.id,
  r.family_id,
  r.author_user_id,
  coalesce(nullif(record->>'date', '')::date, (r.created_at at time zone 'Europe/Madrid')::date),
  'legacy_cook_record',
  coalesce(nullif(record->>'createdAt', '')::timestamptz, r.created_at)
from public.recipes r
cross join lateral jsonb_array_elements(case when jsonb_typeof(r.cook_records) = 'array' then r.cook_records else '[]'::jsonb end) record
where record is not null
on conflict do nothing;

-- Every currently pictured recipe with no event receives one auditable baseline.
insert into public.recipe_cook_events (recipe_id, family_id, user_id, cooked_on, source)
select r.id, r.family_id, null, date '2026-08-14', 'initial_image_baseline'
from public.recipes r
where nullif(btrim(r.image_id), '') is not null
  and not exists (select 1 from public.recipe_cook_events e where e.recipe_id = r.id);

-- Keep legacy fields as a compatibility projection for old clients. The event
-- table is the source of truth for all new reads and writes.
update public.recipes r
set cook_count = coalesce(summary.event_count, 0),
    last_cooked_at = summary.last_cooked_at
from (
  select recipe_id, count(*)::integer as event_count, max(cooked_on)::timestamptz as last_cooked_at
  from public.recipe_cook_events
  group by recipe_id
) summary
where summary.recipe_id = r.id;
update public.recipes r
set cook_count = 0, last_cooked_at = null
where not exists (select 1 from public.recipe_cook_events e where e.recipe_id = r.id);

insert into public.recipe_cook_event_migration_audit (
  migration_key, recipe_total, image_recipe_total, legacy_record_total, baseline_created
)
select
  '20260814160000_create_recipe_cook_events',
  (select count(*) from public.recipes),
  (select count(*) from public.recipes where nullif(btrim(image_id), '') is not null),
  (select count(*) from public.recipe_cook_events where source = 'legacy_cook_record'),
  (select count(*) from public.recipe_cook_events where source = 'initial_image_baseline')
where not exists (
  select 1 from public.recipe_cook_event_migration_audit
  where migration_key = '20260814160000_create_recipe_cook_events'
);
