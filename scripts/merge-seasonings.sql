-- Idempotent data migration: fold legacy recipes.seasonings into recipes.ingredients.
-- No schema changes. Re-running is safe because seasonings is cleared after a
-- successful fold and exact trimmed lines are de-duplicated in order.
BEGIN;

WITH source AS (
  SELECT id, ingredients, seasonings
  FROM public.recipes
  WHERE jsonb_array_length(coalesce(seasonings, '[]'::jsonb)) > 0
), merged AS (
  SELECT source.id,
    coalesce((
      SELECT jsonb_agg(to_jsonb(value) ORDER BY first_ord)
      FROM (
        SELECT value, min(first_ord) AS first_ord
        FROM (
          SELECT btrim(value) AS value, ord::bigint AS first_ord
          FROM jsonb_array_elements_text(coalesce(source.ingredients, '[]'::jsonb)) WITH ORDINALITY AS i(value, ord)
          UNION ALL
          SELECT btrim(value), 1000000 + ord::bigint
          FROM jsonb_array_elements_text(coalesce(source.seasonings, '[]'::jsonb)) WITH ORDINALITY AS s(value, ord)
        ) AS values_to_merge
        WHERE value <> ''
        GROUP BY value
      ) AS deduped
    ), '[]'::jsonb) AS ingredients
  FROM source
)
UPDATE public.recipes AS recipes
SET ingredients = merged.ingredients,
    seasonings = '[]'::jsonb
FROM merged
WHERE recipes.id = merged.id;

-- The legacy JSONB library remains supported. Its old seasonings key is kept
-- as an empty compatibility array after folding into ingredients.
UPDATE public.family_recipe_library AS library
SET recipes = (
  SELECT jsonb_agg(
    CASE WHEN jsonb_array_length(coalesce(item->'seasonings', '[]'::jsonb)) > 0 THEN
      jsonb_set(
        jsonb_set(item, '{ingredients}', merged.ingredients),
        '{seasonings}', '[]'::jsonb
      )
    ELSE item END
    ORDER BY ord
  )
  FROM jsonb_array_elements(coalesce(library.recipes, '[]'::jsonb)) WITH ORDINALITY AS entries(item, ord)
  CROSS JOIN LATERAL (
    SELECT coalesce((
      SELECT jsonb_agg(to_jsonb(value) ORDER BY first_ord)
      FROM (
        SELECT value, min(first_ord) AS first_ord
        FROM (
          SELECT btrim(value) AS value, item_ord::bigint AS first_ord
          FROM jsonb_array_elements_text(coalesce(item->'ingredients', '[]'::jsonb)) WITH ORDINALITY AS i(value, item_ord)
          UNION ALL
          SELECT btrim(value), 1000000 + item_ord::bigint
          FROM jsonb_array_elements_text(coalesce(item->'seasonings', '[]'::jsonb)) WITH ORDINALITY AS s(value, item_ord)
        ) AS values_to_merge
        WHERE value <> ''
        GROUP BY value
      ) AS deduped
    ), '[]'::jsonb) AS ingredients
  ) AS merged
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(coalesce(library.recipes, '[]'::jsonb)) AS entries(item)
  WHERE jsonb_array_length(coalesce(entries.item->'seasonings', '[]'::jsonb)) > 0
);

COMMIT;

-- Verification (read-only): both counts should be zero after commit.
SELECT
  (SELECT count(*) FROM public.recipes WHERE jsonb_array_length(coalesce(seasonings, '[]'::jsonb)) > 0) AS recipes_with_seasonings,
  (SELECT count(*) FROM public.family_recipe_library, jsonb_array_elements(coalesce(recipes, '[]'::jsonb)) AS item WHERE jsonb_array_length(coalesce(item->'seasonings', '[]'::jsonb)) > 0) AS legacy_items_with_seasonings;
