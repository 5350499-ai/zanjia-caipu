# Hong Kong Parallel Migration Audit

Snapshot: 2026-08-30 (source remains online and unchanged)

## Source

- Production: `https://zanjia-caipu.vercel.app`
- Hosting: Vercel static SPA/PWA + Node handlers
- Data: Supabase project `yhpaakgbviennxyybdtm` (eu-west-1)
- Auth: project custom Account/PIN + signed HttpOnly cookie; `auth.users` is empty
- Storage bucket: `recipe-images`

## Source inventory

| table | rows | key-set hash (non-secret identifiers) |
| --- | ---: | --- |
| family_profiles | 4 | 8f51f6566d17e73e6e467981c8af848b |
| family_recipe_library | 1 | fad58de7366495db4650cfefac2fcd61 |
| recipes | 76 | 5b5541496ee5c1d1644223fee52b9726 |
| recipe_cook_events | 82 | 64618fc5a8369e33367e5ddcc0d2925d |
| recipe_cook_event_migration_audit | 1 | 69dd9ce2081e7faa20b2e4e8fd11407b |

All 76 recipes currently have an image binding. Storage inventory previously recorded 75 objects; the byte-level manifest still requires an approved service-key/object export path.

## HK inventory

Canonical Alibaba Cloud Hong Kong instance `8.217.202.187`, Ubuntu 24.04.2, 2 vCPU, ~3.4 GiB RAM, no swap, root 49 GiB (33 GiB free). Host PostgreSQL is 16.15, Node 22.19.0, Nginx 1.24.0, Docker 29.1.3. Existing projects (Fenzu, game-status-radar, SizeOK) are isolated and untouched.

## Current gate

Project-isolated database `zanjia_caipu` and role `zanjia_caipu_app` are provisioned on the shared PostgreSQL engine. Schema and all five source tables have been copied with matching row counts. Candidate service is isolated on loopback port 18141. Image bytes and a public candidate route remain pending because the source bucket is private and no source service-role/object-export credential is available through the approved local channels.
