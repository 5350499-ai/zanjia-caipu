-- A recipe can contribute at most one manual cooking count per family day,
-- regardless of which member records it.
drop index if exists public.recipe_cook_events_manual_daily_idx;
create unique index if not exists recipe_cook_events_manual_daily_idx
  on public.recipe_cook_events (recipe_id, cooked_on)
  where source = 'manual';
