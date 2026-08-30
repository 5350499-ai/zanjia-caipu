# HK Cutover Preparation

1. Freeze or otherwise control source writes for the short cutover window.
2. Take final source database/storage backups and run final delta sync.
3. Reconcile table counts, primary keys, foreign keys, recipe/image bindings and checksums.
4. Verify candidate health, auth, API, images and PWA smoke tests.
5. Switch the governed reverse-proxy route atomically; do not change DNS in Candidate phase.
6. Run post-cutover smoke. Roll back to the retained Vercel/Supabase deployment on any trigger.

This plan is preparation only. Production cutover is an explicit human gate.
