# HK Candidate Target Architecture

- Nginx/shared host capabilities remain untouched until a governed candidate route is approved.
- Immutable release: `/srv/apps/zanjia-caipu/releases/c96955d`
- Candidate service: `zanjia-caipu-candidate-green.service`, loopback `18141`
- Project database: PostgreSQL database `zanjia_caipu`, role `zanjia_caipu_app`
- Project storage namespace: `/srv/apps/zanjia-caipu/shared/storage/recipe-images`
- Auth: existing custom Account/PIN and signed HttpOnly cookie semantics; no GoTrue deployment
- API: existing Node handlers with a direct-PostgreSQL compatibility path selected by `DATABASE_URL`
- Source Vercel/Supabase remain rollback reference and are not used by Candidate runtime
