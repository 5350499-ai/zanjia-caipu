-- Ensure re-running legacy cook-record backfill cannot duplicate an event.
create unique index if not exists recipe_cook_events_legacy_dedupe_idx
  on public.recipe_cook_events (
    recipe_id,
    cooked_on,
    source,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    created_at
  )
  where source = 'legacy_cook_record';
