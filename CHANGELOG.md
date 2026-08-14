# 更新日志

## [统一登录入口] 2026-08-01

- 登录页统一为一个“账号 + 密码/PIN”表单：输入管理员邮箱自动走管理员登录，输入成员编号自动走家庭成员登录。
- 删除管理员折叠登录区，保留单独的“游客浏览”按钮。
- 未修改认证接口、密码校验、会话 Cookie、数据库结构或账号权限。

## [材料统一] 2026-08-01

### 修改

- 新增和编辑菜谱页面删除独立“调料”输入区，材料输入提示同时覆盖食材与调味品。
- 详情页仅显示统一材料、制作步骤、注意事项、历史备注、做菜记录和留言区，编号连续。
- 前端缓存、IndexedDB 快照和服务端 API 读取统一合并旧 `seasonings` 到 `ingredients`，按原顺序去空行并精确去重。
- 新写入只保存统一材料，旧 `seasonings` 列保留为空数组兼容旧客户端；不会重复追加。
- 增加 `scripts/merge-seasonings.sql` 幂等事务脚本，覆盖 `recipes` 和旧 `family_recipe_library` JSONB 菜谱。

### 数据迁移与测试

- 迁移前只读统计：`recipes` 共 53 份，其中 14 份含调料（14 份材料和调料同时有内容，0 份仅有调料）；旧 JSONB 库 1 行、4 个对象，其中 1 个对象含调料。
- 已在生产 Supabase 项目内以事务执行合并；迁移后主表和旧 JSONB 库调料非空数量均为 0，`ingredients` 均保持非空。
- 未删除 `seasonings` 列，未修改图片、作者、共享、收藏、排序或权限字段；迁移前行快照保留在本次查询审计记录中。
- `node --check src/main.js`、`node --check api/recipes.js`、`npm.cmd run build` 通过；Preview 待提交后部署，Production 不变。

## [文档基线] 2026-07-11

### 新增

- 在项目根目录建立 `CLAUDE.md`、`BUSINESS_RULES.md`、`ARCHITECTURE.md` 和 `CHANGELOG.md`。
- 根据当前前端、API、Supabase schema、Storage、缓存和 PWA 实现记录长期开发规范与系统基线。

### 说明

- 本次只新增规范文档，没有修改业务代码、数据库、权限、图片或部署配置。
- 当前代码版本标识为前端 `APP_VERSION v1.0.11`；本条记录描述的是文档初始化，不代表功能版本升级。
- 已记录当前仓库存在的历史中文编码损坏风险；后续修改必须遵守 UTF-8 无 BOM 规则并进行真实页面验收。

### 后续维护要求

- 新增业务规则时同步更新 `BUSINESS_RULES.md`。
- 修改目录、模块、数据流或部署方式时同步更新 `ARCHITECTURE.md`。
- 每次开发完成追加本文件，并注明修改文件、功能、修复、测试结果和未完成项。

## [排序与缓存优化] 2026-07-12

### 修改

- 使用当前用户/设备本地打开序号稳定排序；新增菜谱和最近打开菜谱排在前面，停止使用全局 `last_viewed_at` 影响列表。
- 图片 IndexedDB/Cache Storage 使用稳定的 `imageId@imageVersion` 键，取消应用主动清理有效图片的 LRU 行为。
- 增加同一图片的并发加载去重，避免启动预加载与首页渲染同时触发重复网络下载。
- 清除本地缓存时同时清除本地菜谱快照、打开顺序、图片缓存和静态资源缓存，但保留登录状态并重新同步服务器。
- 在管理员菜单增加 Supabase Storage `recipe-images` bucket 对象数量与扫描容量统计；未迁移 Storage，未删除服务器图片。
- 支持通过 `SUPABASE_STORAGE_CAPACITY_BYTES` 配置容量上限并在达到 70% 时提示管理员；未配置时只显示已扫描容量。

### 测试

- 已完成静态代码检查与生产构建前的修改验证；真实手机、真实 Supabase Storage 容量和线上完整交互回归需在部署后继续验证。

## [菜单交互修复] 2026-07-12

## [长期登录与会话恢复] 2026-07-18

### 修改

- `lib/server-auth.js` 将签名 HttpOnly 会话有效期从 30 天延长为一年。
- `api/auth.js` 成功验证时滚动续期；无效会话明确返回 `401/session_expired`。
- `src/main.js` 保留用户 localStorage 缓存，网络抖动/5xx/初始化期间不清除登录状态；仅确认会话过期才回到登录页，并在重新联网、聚焦和 PWA 恢复时后台复核。
- 新增 `src/supabase-session.js`，懒加载 Supabase 客户端并显式启用持久会话、自动刷新和 URL 会话检测，不修改既有 storage key。
- `api/config.js` 仅返回 Supabase URL/anon key；Service Role 不会暴露。
- PWA 静态壳版本升级为 `v1.0.14`，纳入会话桥接模块并淘汰旧壳缓存。

### 验证

- `node --check`：认证相关 JS 通过。
- `npm.cmd run build` 通过。
- 本地签名 Cookie 验证确认 Max-Age 为 31536000 秒。

### 修复

- 增加菜单全屏遮罩，点击菜单外区域会关闭菜单且不会触发底层内容。
- 菜单项执行前自动关闭菜单；再次点击 ☰ 仍可正常开关。
- 菜单打开时锁定页面滚动，仅允许菜单内部滚动。
- 增加浏览器返回/系统返回手势下的菜单优先关闭逻辑。
- 版本标识更新为 `v1.0.13`，同步更新 Service Worker 静态缓存版本。

## [快速操作防护、深色文字对比度与收藏入口] 2026-08-01

### 修改

- `src/main.js` 为新增/编辑草稿、图片处理和保存流程增加草稿代次校验、重复操作保护与异步回调失效保护。
- `src/main.js` 增加首页“我的收藏”统计入口，复用现有 `favoriteUserIds` 按当前用户筛选。
- `src/styles.css` 增加输入文字、占位文字和光标主题变量，并补充深色模式搜索框、共享状态卡和统计卡对比度。

### 修复

- 防止快速重复保存、快速切换页面或旧图片处理回调访问已销毁的 `draft.imageFile`。
- 运行时错误不再在已启动应用中直接替换为全局崩溃页，仅记录到 Console。

### 验证

- 本轮仅部署 Preview；未修改数据库、账号权限、图片存储、游客模式或正式网址。
## 2026-08-10

### 详情页图片与材料区块间距

- 删除主图下方第一段材料区块继承的多余顶部边框。
- 其他菜谱章节分隔线保持不变。
## 2026-08-14 - UI root Phase 1

- Added the first design-token, theme, base, layout, component, form, and iOS platform layers without changing business behavior or visual values.
- Kept the legacy stylesheet in place for compatibility; source-text encoding debt remains intentionally out of scope.

## 2026-08-14 - Detail note and cook record form UI

- Applied dark-theme surfaces and readable text/caret colors to the shared note editor used by history notes and cooking records.
- Constrained date inputs and action grids to the parent width for narrow iPhone layouts.

## 2026-08-11

### 新增/编辑菜谱图片预览

- 新增和编辑页面的图片预览统一使用 `object-fit: cover` 并铺满 4:3 预览框。
- 深色模式下“删除图片”改为深色危险按钮样式。
## 2026-08-14 - UI root Phase 2
- Connected selected typography and repeated theme colors to the Phase 1 token layer without changing page structure or business behavior.
- Kept legacy page-specific CSS and source-text encoding debt unchanged for later phases.
## 2026-08-14 - UI root Phase 3
- Added shared button behavior and form-control foundations, then connected existing business selectors through lightweight CSS adapters.
- Preserved existing dimensions, page structure, interaction logic, and legacy business-specific styles.
## 2026-08-14 - UI root Phase 4
- Added surface, border, radius, and shadow tokens and connected existing card, panel, menu, dialog, and bottom-bar selectors through CSS adapters.
- Preserved page structure, layout, imagery, and business behavior.
## 2026-08-14 - UI root Phase 5
- Added responsive width, min-width, max-width, date-control, safe-area, and compact/wide phone primitives without changing page structure or business behavior.
- Kept existing responsive page rules and image ratios intact; no home redesign was introduced.
## 2026-08-14 - UI root Phase 6
- Added shared image-frame tokens and adapters for 4:3 cover presentation, placeholders, record images, and fixed-width growth thumbnails.
- Kept lightbox contain behavior and all image storage, caching, upload, deletion, and touch logic unchanged.
