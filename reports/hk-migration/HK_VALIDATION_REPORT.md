# HK Candidate Validation

## Passed

- Isolated systemd Candidate is active on loopback port 18141.
- Static home returns successfully.
- Guest auth and `/api/recipes` return successfully against the HK database.
- `/api/recipes` returned 76 migrated recipes.
- Candidate runtime uses `DATABASE_URL` and project-local `STORAGE_ROOT`; it does not point at source Supabase.

## Pending

- Image read acceptance passed against the migrated 76-object project-local Storage; write-path acceptance remains in the synthetic Candidate test queue.
- Private source bucket export is not available through the current approved connector set; anonymous Storage list/download returns no objects/400. No source Storage setting was changed.
- External candidate URL/HTTPS route is not created; internal loopback smoke is used until a governed route is available.

## Safety

Vercel Production, source Supabase database and source Storage remain online and unchanged. No test recipe or real source row was written.
