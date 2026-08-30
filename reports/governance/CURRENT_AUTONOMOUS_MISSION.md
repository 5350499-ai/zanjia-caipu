# Current Autonomous Mission

- Goal: `HK_FULL_STACK_CANDIDATE_READY_FOR_CUTOVER`
- Current phase: `HK_SERVER_INVENTORY`
- Current gate: `HUMAN_GATE_ALIBABA_AUTHENTICATED_WORKBENCH_SESSION`
- Last confirmed safe point: `GLOBAL_ZERO_DOWNTIME_RELEASE_ADOPTION_COMPLETE`
- Source Production: Vercel `https://zanjia-caipu.vercel.app` with external Supabase
- HK target: Alibaba Cloud Hong Kong `8.217.202.187`, project root `/srv/apps/zanjia-caipu`

## Boundaries

Vercel Production, Supabase, DNS, Storage and real user data remain unchanged.
HK candidate must use isolated project database, Auth scope, Storage namespace,
release directory, service, port, logs and backups. No candidate writes to source
Production.

## Active blocker

The Codex internal `iab` browser backend is not available in this session;
browser discovery exposed only a Chrome extension channel, which is not
permitted for Alibaba Cloud management under the global policy. This is a
recoverable browser-channel selection failure, not an HK infrastructure
failure. Credentials and MFA must not be requested in chat or entered by the
agent.

## Next safe action

After the Codex internal browser backend is made available (and, only if it is
unauthenticated, the account owner completes the minimum Alibaba Cloud
sign-in/MFA action there), reuse that session to collect the read-only HK
server inventory. Do not use desktop Chrome or perform DNS cutover before the
cutover gate.
