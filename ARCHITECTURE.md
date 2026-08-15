# 咱家菜谱系统架构

## 总体结构

项目是一个无框架的静态 PWA：浏览器加载 `index.html`、`src/styles.css`、`src/main.js` 和 `src/cloud.js`；前端负责页面模板、状态、交互、本地缓存和 API 调用。生产部署目标是 Vercel，正式域名为 `zanjia-caipu.vercel.app`。

```text
浏览器/PWA
  ├─ index.html + src/styles.css
  ├─ src/main.js（页面状态、模板、事件、缓存）
  ├─ src/cloud.js（/api/recipes、/api/images 封装）
  └─ sw.js（静态壳与图片响应缓存）
          │
          ▼
Vercel/Node API
  ├─ api/auth.js       会话、管理员/成员/游客登录
  ├─ api/recipes.js    菜谱可见性、读写和删除
  ├─ api/images.js     图片读取、上传、诊断、dry-run 清理
  ├─ api/comments.js   游客留言
  ├─ api/members.js    管理员成员管理
  └─ api/config.js     运行配置
          │
          ▼
Supabase REST + Storage
  ├─ family_profiles
  ├─ recipes
  ├─ guest_comments
  └─ recipe-images bucket
```

## 前端状态与页面

`src/main.js` 采用单根节点条件渲染，不使用客户端路由框架。主要页面状态为：`home`、`detail`、`new`、`edit`、`members`。浏览器 History 用于详情页进入/返回；详情页只保留普通纵向文档流和系统返回手势，不应重新加入横向 transform 页面切换。

右上角菜单由 `settings-layer` 遮罩和其内的 `settings-popover` 组成：遮罩负责拦截背景点击，菜单负责内部滚动；`html.menu-open`/`body.menu-open` 在菜单打开时锁定背景滚动。菜单关闭后由统一渲染流程恢复滚动状态，浏览器 `popstate` 优先关闭菜单。

核心状态包括当前用户、菜谱数组、分类/范围/搜索条件、选中菜谱、成员、表单草稿、图片预览、备注/做菜记录编辑器和主题模式。

## 数据模型

数据库初始化在 `supabase/schema.sql`：

- `family_profiles`：账号编号、显示名、角色、家庭 ID、PIN 哈希、启停状态。
- `recipes`：菜谱正文、作者、家庭、共享状态、收藏用户、做菜记录、图片 ID/版本、时间字段。
- `guest_comments`：共享菜谱游客留言及创建时间、匿名化设备信息。
- `recipe-images`：Supabase Storage bucket；当前 schema 要求建立私有 bucket，服务端通过 Service Role 访问。

数据库表启用 RLS，客户端不直接使用 Service Role；API 在服务端按会话角色和 `family_id` 过滤。

## API 层

## 会话与认证持久化

当前业务账号仍由 `/api/auth` 使用签名 HttpOnly Cookie 鉴权。Cookie 有效期为一年，并在成功 GET 验证时滚动续期。前端先恢复 `family-recipes-last-user` 缓存，再后台验证；网络失败、5xx 和初始化空状态都不会误登出，只有 `401/session_expired` 才会清除缓存并回到登录页。

`src/supabase-session.js` 提供可选的浏览器 Supabase Auth 会话桥接：`persistSession: true`、`autoRefreshToken: true`、`detectSessionInUrl: true`。未显式设置 `storageKey`，以保留 Supabase 默认 key；桥接加载失败不会阻塞自定义账号登录。`SUPABASE_ANON_KEY` 仅通过 `/api/config` 返回，Service Role 永不下发。

所有 API 通过 `lib/server-auth.js` 读取签名 HttpOnly Cookie。`lib/supabase-server.js` 统一发送 Supabase REST 请求并设置认证头；`lib/storage-images.js` 封装图片上传、下载、列举和删除。

- `/api/auth`：GET 当前会话；POST 管理员邮箱/密码、成员编号/PIN、游客会话；DELETE 退出。
- `/api/recipes`：按角色返回可见菜谱；创建/更新/删除由创建者或管理员执行。
- `/api/images`：按菜谱可见性读取图片；上传由创建者或管理员执行；清理与诊断仅管理员可用，清理当前 dry-run。
- `/api/comments`：共享菜谱留言读取；游客创建；创建者/管理员删除。
- `/api/members`：管理员创建、修改、停用、删除和列出成员。

## 持久化与缓存

前端使用 `localStorage` 保存按用户分隔的菜谱、最近用户信息和当前设备的菜谱打开顺序；IndexedDB 保存菜谱快照、图片 Blob 和元数据；Cache Storage 缓存图片 API 响应。图片缓存键使用 `imageId@imageVersion`，不会因为 signed URL 变化而失效。有效图片不再由应用主动 LRU 删除，只在用户明确清除本地缓存或图片真正替换时删除。前端用按缓存键的 in-flight Promise 去重并发下载。`sw.js` 缓存静态壳、离线导航和图片。服务器数据始终是最终事实来源。

## 构建与部署

`scripts/build-static.cjs` 清理并复制静态入口到 `dist/`；`npm.cmd run build` 是生产构建命令。`vercel.json` 指定构建命令、输出目录、静态资源响应头和 no-store 策略。`server.cjs` 提供 LAN 开发预览及本地 API 路由。

## 已知约束

## Cooking event layer (Phase 7.2)

The home annual cooking trend uses the authenticated `family-trend` action in `/api/cook-events`, with server-side aggregation and the same member attribution rules as family stats. Its SVG renderer leaves future current-year months as null and protects year navigation with a request generation guard.

`api/cook-events.js` exposes authenticated event reads and writes. `lib/cook-events.js` centralizes Europe/Madrid calendar handling, recipe visibility checks, event summaries, baseline creation, and monthly ranking tie-breaks. The `recipe_cook_events` table is append-oriented and auditable; `recipes.cook_count`/`last_cooked_at` are maintained only as compatibility projections. `api/recipes.js` returns event-derived counts and the current monthly top five, while `src/cloud.js` and `src/main.js` connect the existing “记录这次” UI without introducing a second button or changing image/auth/storage behavior.

## 材料统一兼容（2026-08-01）

## Image lifecycle safety (Phase 7.4)

Explicit image removal now calls the server-side `deleteImageIfUnreferenced` helper after the recipe reference has been persisted. The helper scans recipe main-image and legacy `cook_records` references before calling private Supabase Storage deletion. Recipe deletion performs the same check after deleting the row; failed cleanup is returned as a pending status and logged. The existing administrator orphan cleanup endpoint remains dry-run.

- `recipes.ingredients` 是唯一对用户展示和写入的材料清单，食材与调味品按原顺序合并。
- 数据库 `recipes.seasonings` 列暂时保留为空数组以兼容旧客户端；服务端读取和写入会对旧 payload 做精确去重合并。
- `src/main.js` 的 `normalizeRecipe` 同样转换 localStorage、IndexedDB 和云端快照，避免旧缓存再次显示独立调料区或重复追加。
- `scripts/merge-seasonings.sql` 是无 schema 变更、可重复执行的事务脚本，覆盖主 `recipes` 表和旧 JSONB 菜谱库。

- 当前仓库部分历史中文字符串已出现编码损坏迹象；后续任何修改必须先确保 UTF-8 无 BOM，并在生产页面检查真实文字，而非只检查 HTTP 状态码。
- Storage 自动删除目前必须保持 dry-run；删除/替换逻辑在确认数据库引用成功前不得清理旧文件。
- 不得把 Service Role Key、管理员密码或 PIN 写入前端 bundle、Git 或文档。
- 管理员可通过设置菜单读取 `recipe-images` bucket 的对象数量和扫描到的总字节数；`SUPABASE_STORAGE_CAPACITY_BYTES` 可提供容量上限并计算 70% 告警。该统计是当前 bucket 对象合计，不等同于 Supabase 账户配额页面的全局配额。

## Cook history and first-image completion (Phase 7.5)

Cook counts belong to `recipe_cook_events`, not to the image itself. A recipe with no events creates its first automatic event after a successful save with a non-empty `image_id`; this also covers adding the first image later. The existing idempotent `recipe_created_with_image` source is retained for compatibility. Replacing, deleting, or re-uploading an image never changes existing cook history. Historical `initial_image_baseline` events count toward totals and rankings, but do not block the daily manual-cook action; daily status is limited to manual and first-image event sources.
- First-image event dates are immutable. `ensureFirstCookEventForImageRecipe` checks existing events before creation and uses the Europe/Madrid date only at successful image binding; later image changes never rewrite cook history.

## 统计缓存与年度趋势（2026-08-15）

继续使用 `family-recipes-images` IndexedDB；数据库版本由 3 升级到 4，仅新增 `stats-cache` store，不改变既有图片和菜谱快照 store。统计缓存按 `familyId` 隔离，覆盖家庭统计、排行榜和年度趋势，使用短 freshness 窗口的 stale-while-revalidate。缓存只改善首屏显示，不替代服务器事实；请求代际仍负责丢弃过期响应。年度趋势复用既有做菜事件口径和成员颜色。
