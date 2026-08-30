# HK Rollback Plan

Vercel Production and the original Supabase project remain online and unchanged. Candidate failure means stopping the isolated systemd unit and retaining the previous source deployment as rollback reference. DNS is not changed. A future cutover must retain the source deployment ID, take a final backup/delta, switch traffic atomically through the governed proxy, and trigger rollback on failed health/smoke checks. Candidate test data must never be written to source.
