# Current Autonomous Mission

- Goal: `HK_FULL_STACK_CANDIDATE_READY_FOR_CUTOVER`
- Current phase: `HK_FUNCTIONAL_ACCEPTANCE`
- Current gate: `AUTOMATED_FUNCTIONAL_ACCEPTANCE`
- Last confirmed safe point: `FULL_STORAGE_COPY_AND_RECONCILIATION_PASS`
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

## Storage and Candidate safe point

All 76 bound recipe images (42,021,721 bytes) were exported through the
authenticated read-only Production Guest image API into the isolated project
Storage. Target manifest SHA-256 hashes match source; no source objects were
modified. Database counts/key hashes/FK checks also match. A project-scoped
backup and isolated database/storage restore drill passed.

Candidate release `c30d523` is active as
`zanjia-caipu-candidate-green.service` on loopback port 18141. Guest core API,
admin login, synthetic recipe CRUD, comments and same-day cook-event duplicate
protection smoke tests passed. The remaining work is full acceptance,
resource/backup evidence, delta-sync and cutover-readiness documentation; the
Candidate is not exposed as Production and no DNS cutover is permitted.
Do not use desktop Chrome or perform DNS cutover before the cutover gate.
