# Current Autonomous Mission

- Goal: `HK_FULL_STACK_CANDIDATE_READY_FOR_CUTOVER`
- Current phase: `HK_STORAGE_RESTORE`
- Current gate: `FULL_STORAGE_COPY`
- Last confirmed safe point: `FULL_DATABASE_COPY_PASS`
- Source Production: Vercel `https://zanjia-caipu.vercel.app` with external Supabase
- HK target: Alibaba Cloud Hong Kong `8.217.202.187`, project root `/srv/apps/zanjia-caipu`

## Boundaries

Vercel Production, Supabase, DNS, Storage and real user data remain unchanged.
HK candidate must use isolated project database, Auth scope, Storage namespace,
release directory, service, port, logs and backups. No candidate writes to source
Production.

## Verified management channel

Alibaba Cloud CLI `swas-open` Command Assistant API is available through the
governed local OAuth profile and successfully executed read-only commands on
instance `606ce29502da4c2fad84675aacd6ac04` as `admin`. No credential values
were printed or persisted.

## Inventory safe point

Hostname `iZj6cf4shuuewk2c7uvz5wZ`, Ubuntu 24.04.2 LTS, 2 vCPU, about 3.4 GiB
RAM with about 1.0 GiB available, 0 swap, 33 GiB free disk, Node 22.19.0,
Docker 29.1.3, Nginx 1.24.0 and PostgreSQL 16.15. Existing projects are
Fenzu, game-status-radar and SizeOK. No zanjia service or directory exists.

## Next safe action

Database schema and all five source tables are restored in the isolated HK
database with matching row counts. The Candidate release is running on
loopback port 18141 with direct PostgreSQL and project-local Storage adapters.
Image migration is blocked only by the private source bucket export credential;
anonymous access was tested and rejected. Once an approved export channel is
available, copy/reconcile image bytes, then complete API/functional acceptance
and backup/rollback gates.
Do not use desktop Chrome or perform DNS cutover before the cutover gate.
