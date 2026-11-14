# 治理 schema 与迁移

本仓是业务 schema 和迁移的唯一所有者。新版治理将任务和运行审计放在 PostgreSQL `governance` schema；运行/恢复节点放在独立 `governance_checkpoint` schema。Agent 仓库负责 `governance-v2` CLI、Graph、规则和受控 SQL writer。写入器使用同一 PostgreSQL connection 在业务表和治理表之间执行单个区/组事务；不要为同一路径再启用第二套 HTTP/ORM 写入权威。

## 部署顺序

1. 审阅 `prisma/migrations/202611110001_event_governance/migration.sql`，执行 `prisma migrate deploy`。迁移只新增 `OrganizationType.unknown`、Membership 日期依据/状态/证据/互斥组和 governance 七表，不迁移旧 Agent 运行数据。
2. 使用有 schema 建立权限的管理连接，通过 Agent `setup-checkpoints` 建立 checkpoint schema/table。
3. 由 DB 管理员执行 `prisma/grants/governance-v2.sql` 并提供 `runtime_role`、`business_reader`、`site_reader` 变量。三种角色单独配置登录和凭据；脚本不管理密码。runtime 读写所需业务实体、审计和治理/checkpoint 表；business_reader 只读 writer 所需上下文；site_reader 仅读显式投影表。没有一类角色获 UserFeedback 权限。
4. 在 Agent 设置 `GOVERNANCE_DATABASE_URL` 指向 runtime 连接、`GOVERNANCE_READ_DATABASE_URL` 指向同库业务只读连接。apply 必须双 URL 分离；dry_run 可在本地受控测试用同连接。
5. Personal site 单独设置 `TASUKI_GOVERNANCE_READ_DATABASE_URL` 指向 site_reader。详见个人站手册。禁止将 runtime 凭据放入个人站。

schema/migration 修改后运行：

```bash
npx prisma validate
npx prisma generate
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

这里 DATABASE_URL 应是一次性本地数据库或专用 CI 数据库。绝不能用生产库做 reset 或 schema diff 的写入目标。手工新增的 CHECK、notification owner XOR 等约束只有 migration SQL 能表达，必须同时更新 migration 和其集成断言。

## 业务模型语义

- unknown organization type 代表当前无法分类，不推断为 corporate_team。
- Membership 日期依据为 unknown/source/inferred；既有日期在没有证据回填前保持 unknown。
- endState 为 unknown/ongoing/ended，与 endDate 独立；预计日期不代表毕业或离队已核实。
- exclusivityGroup 仅由明确业务规则写入，不从 organization.type 自动推断。
- dateEvidence 保存规则使用的来源/锚点摘要，治理运行明细在 GovernanceChange 和 Finding。

## 写入和审计

Agent 使用硬编码的 Operation 联合类型和参数化 SQL，不接受模型生成 SQL。新增 operation 需在 contracts 校验、计划版本检查、单事务 writer、AuditLog 与 integration tests 中同时实现。跨实体 merge/split 必须审查源/目标版本、关联迁移清单、唯一约束碰撞和 AuditLog，任何未覆盖关联都不能无声丢弃。

事务顺序为 fencing/version checks、业务操作、SourceReference/AuditLog、GovernanceChange applied、CacheInvalidation 和批次终态。cache invalidation 使用已有表/版本边界；此功能若变更需同步检查站点和 API 缓存读取方。数据库提交后通知和站点观测是异步流程，不参与该事务。

按区/组的处理测试在 Agent 仓库：`bash scripts/test-governance-integration.sh`。脚本在本机 Unix socket disposable Postgres 部署完整 migration 链，仅用于测试，无生产回退/清空逻辑。
