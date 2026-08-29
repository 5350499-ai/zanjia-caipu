# 香港零停机发布运行契约

本项目的香港发布遵循全局 `ZERO_DOWNTIME_RELEASE_POLICY.md`，不改变当前
Vercel + Supabase Production。服务器操作必须通过全局治理工具和阿里云
Workbench/Command Assistant 完成。

## Release layout

- `/srv/apps/zanjia-caipu/releases/<release-id>`：immutable candidate artifact
- `/srv/apps/zanjia-caipu/current`：当前生产 slot 指针
- `/srv/apps/zanjia-caipu/shared`：非敏感共享运行资源
- `/srv/apps/zanjia-caipu/backups`：回滚与恢复材料
- `/srv/apps/zanjia-caipu/logs`：项目独立日志
- Production slot：BLUE，端口 `loopback/tcp/18140`
- Candidate slot：GREEN，端口 `loopback/tcp/18141`

## Required order

1. 在干净提交上构建独立 release，不在 `current` 或正在服务的目录构建。
2. 生成并验证 release manifest，确认环境变量契约已满足；secret 只从服务器
   受控环境读取，不进入仓库或日志。
3. 原子登记并检查候选端口，启动 GREEN candidate service。
4. 通过 health、API、业务 acceptance 和资源门禁；失败只淘汰 candidate，
   不影响 BLUE。
5. 获取 `SHARED_NGINX` lease，备份当前配置，执行 `nginx -t`，再原子切换
   作用域 upstream 并 reload。
6. 执行 post-cutover smoke；失败时恢复备份 upstream、验证 BLUE 并保留失败
   release 作为诊断材料。
7. 保留当前 release 与至少两个 rollback-ready 历史 release，未经治理批准
   不清理 active 或恢复材料。

本运行契约只描述发布隔离与回滚边界；数据库、Auth、Storage、DNS 和业务
迁移仍需各自的授权、备份和验收门禁。
