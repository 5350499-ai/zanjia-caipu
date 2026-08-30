# HK Data Migration Record

## Source snapshot

The source snapshot was collected read-only through the governed Supabase connector on 2026-08-30. No source rows or Storage objects were changed.

## Copy status

- Schema: PASS (project-isolated PostgreSQL 16.15 target)
- family_profiles: 4/4
- family_recipe_library: 1/1
- recipes: 76/76
- recipe_cook_events: 82/82
- recipe_cook_event_migration_audit: 1/1
- Original IDs preserved.
- PIN hashes are stored only in the target database and are not recorded in reports.
- Storage bytes: BLOCKED pending approved private-bucket export path.

## Delta procedure

Before any future cutover, take a fresh source snapshot, copy rows changed after the snapshot watermark by primary key/modified timestamp, copy newly referenced image objects, then rerun table/key/image reconciliation. Source write freeze and final delta are cutover-gate operations and are not performed in Candidate phase.
