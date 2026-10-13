# PostgreSQL 知识分享社区上线诊断清单

适用场景：约 10 人团队维护的 PostgreSQL 知识分享网站。本文是可执行的上线前审查模板，不是已对生产系统实施或验证的结论。请由具备数据库访问授权的负责人，在隔离/预生产环境先运行 SQL，再按变更流程应用生产配置。本文不要求提供生产凭据。

## 假设与边界

- SQL 以 PostgreSQL 15–17 为参考；云托管服务可能限制参数、扩展、超级用户或 WAL 管理。先执行 `SHOW server_version;`，并对照托管商对应版本文档。
- 示例假设内容表名为 `public.articles`，包含 `id`, `tenant_id`, `author_id`, `title`, `body`, `published_at`；账号名和 schema 按实际系统替换。
- 租户身份只能由已完成认证的服务端写入事务局部变量，不接受客户端直接指定 tenant_id/user_id。`SET LOCAL` 只限制上下文生命周期，不认证 GUC 值：若共享数据库角色可任意设置自定义 GUC，SQL 注入者可能伪造租户 ID；需审查信任边界，必要时用不可伪造角色映射/不同数据库身份。使用兼容事务池化的事务内设置，并测试提交、回滚、异常路径及事务外语句。
- 本清单是面向需求的文档交付和检查方法，不是生产系统安全认证，也没有访问或验证目标生产系统。应用代码、实际角色继承、迁移、代理/连接池、备份平台和托管限制均需具备权限的维护者人工复核；任何输出异常或版本差异先停止变更。

## 检查项（风险、目的、执行与判断、修复）

### 1. 多租户表启用及强制 RLS — 高

**目的：** 确认策略确实拦截普通应用连接，并避免表所有者意外绕过。

```sql
SELECT n.nspname AS schema_name, c.relname, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname = 'public'
  AND c.relname IN ('articles');
```

**通过：** `rls_enabled` 和 `rls_forced` 都为 true。**修复：** 使用迁移/表所有者角色执行：

```sql
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles FORCE ROW LEVEL SECURITY;
```

PostgreSQL 超级用户和拥有 `BYPASSRLS` 的角色始终绕过 RLS。表所有者通常绕过，但 `FORCE ROW LEVEL SECURITY` 会让其正常查询也受策略约束；所有者仍能更改策略/对象，因此必须作为受控 DDL 管理路径。测试中将普通 `app_runtime` 作为跨租户负向主体；另外分别审计 owner、superuser、BYPASSRLS 属性及其权限，不要把高权限主体当作普通负向测试身份。`FORCE` 不能约束超级用户/BYPASSRLS。

### 2. CRUD 策略、默认拒绝、USING/WITH CHECK — 高

**目的：** 明确每种操作的行范围和写入后约束。无匹配策略时 RLS 默认拒绝。

```sql
SELECT schemaname, tablename, policyname, permissive, roles,
       cmd, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='articles'
ORDER BY policyname;
```

一种示例（按真实身份模型审核后再用）：

```sql
CREATE POLICY articles_select_tenant ON public.articles
  FOR SELECT TO app_runtime
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY articles_insert_tenant ON public.articles
  FOR INSERT TO app_runtime
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY articles_update_tenant ON public.articles
  FOR UPDATE TO app_runtime
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY articles_delete_tenant ON public.articles
  FOR DELETE TO app_runtime
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

**通过：** 每种实际操作均有经过审查的策略；UPDATE 同时限制旧行和新行；空上下文不能访问数据。不要将示例直接照搬到含公开文章、版主或私有草稿的业务，需表达真实业务规则并验证组合策略（permissive/restrictive）的 OR/AND 行为。

### 3. 运行账号最小权限与绕过属性 — 高

**目的：** 运行时账号不是超级用户、表所有者或 RLS 绕过角色；迁移职责与服务职责隔离。

```sql
SELECT rolname, rolsuper, rolbypassrls, rolinherit
FROM pg_roles WHERE rolname IN ('app_runtime','app_migrator');
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('app_runtime','app_migrator')
  AND table_schema='public' ORDER BY grantee, table_name, privilege_type;
```

**通过：** `app_runtime.rolsuper=false`、`rolbypassrls=false`，不是 `articles` 所有者；只获必需 DML 权限，不得有 DDL/角色管理。**修复模板：** 权限变更前检查现有授权，按需撤销而非盲目复制：

```sql
REVOKE ALL ON public.articles FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO app_runtime;
```

如使用 sequence，另行授予所需 sequence 权限。管理员/表所有者测试使用受控维护账号，不能把其结果当作运行时 RLS 通过。

### 4. 双租户负向读写验证 — 高

**目的：** 以同一个最小权限应用角色验证租户 A 看不到也不能篡改租户 B。

```sql
BEGIN;
SET LOCAL ROLE app_runtime;
SET LOCAL app.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT count(*) AS visible_rows FROM public.articles
WHERE tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; -- 必须为 0
UPDATE public.articles SET title='cross-tenant-write-test'
WHERE tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; -- 必须更新 0 行
INSERT INTO public.articles(id, tenant_id, author_id, title, body)
VALUES (gen_random_uuid(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        gen_random_uuid(), 'negative test', ''); -- 必须被 WITH CHECK 拒绝
ROLLBACK;
```

以租户 B 再做对称测试；另在**没有设置** `app.tenant_id` 的事务内执行 SELECT/INSERT/UPDATE，必须默认拒绝（类型转换失败也属于拒绝，但应用需安全处理错误）。保存执行角色、策略版本、期望/实际行数和错误码。若 SELECT 返回 B 数据或 UPDATE 有影响行，立即阻断上线。

### 5. 事务身份与连接池复用隔离 — 高

**目的：** 防止连接池把上个请求的 tenant/user context 留给下个请求。

```sql
BEGIN;
SET LOCAL app.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT current_setting('app.tenant_id', true); -- 本事务应为租户 A
COMMIT;
SELECT current_setting('app.tenant_id', true); -- 应为空/未设置，不得仍为租户 A
```

**通过：** 应用每个事务在验证认证主体后，由服务端立即使用绑定参数执行事务局部设置；请求提交、回滚或异常结束后，池的下一个借用者从空上下文开始。用两个顺序借用同一物理连接的会话分别验证提交、回滚、异常路径及事务外语句。检查驱动、事务池模式和重试路径。不要用会跨事务保留状态的会话级 `SET`。自定义 GUC 本身不是认证：若不可信 SQL 可任意设置该值，RLS 无法建立身份边界，必须审查 SQL 注入面/数据库代理信任链。

### 6. 慢查询基线与执行计划 — 中高

**目的：** 以实测负载选优化对象，避免凭直觉加索引。由 DBA 确认扩展可用和采样周期；`pg_stat_statements` 通常需在 `shared_preload_libraries` 配置并重启后创建扩展。

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT queryid, calls, round(total_exec_time::numeric,1) AS total_ms,
       round(mean_exec_time::numeric,1) AS mean_ms,
       rows, shared_blks_read, temp_blks_written,
       left(query, 250) AS sample
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;
```

选取代表性、安全的只读慢查询，在同版本、相近数据量的预生产运行：

```sql
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT id, title, published_at FROM public.articles
WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  AND published_at >= now() - interval '30 days'
ORDER BY published_at DESC LIMIT 50;
```

**通过：** 记录 calls/总耗时/均耗时/共享块/temp 块与计划；关注估算与实际行数偏差、重复扫描、排序落盘、I/O 和 RLS 条件是否出现。`EXPLAIN ANALYZE` 会真实执行查询；不要对有副作用语句或未经风险评估的高负载查询运行。验收记录还应包含 `loops`、planning/execution time、估算与实际行数偏差、shared/local/temp blocks、排序 spill，并按压测和请求预算定义 p95/p99 目标；没有实际负载证据时不要臆造固定阈值。统计信息可能包含敏感 SQL 文本，限制查看和导出权限。

### 7. 索引建议与前缀操作符类 — 中

**目的：** 索引依据实际 WHERE/JOIN/ORDER BY 和选择性，并计入写放大与存储成本。

多租户列表的候选索引（只有计划证明有益且避免重复索引时再建立）：

```sql
CREATE INDEX CONCURRENTLY articles_tenant_published_idx
  ON public.articles (tenant_id, published_at DESC);
```

若 `title` 是 `text`，locale/collation 与查询形态适配，且使用左锚定前缀（`LIKE 'foo%'`），可评估：

```sql
CREATE INDEX CONCURRENTLY articles_title_prefix_idx
  ON public.articles (title text_pattern_ops);
-- 用 EXPLAIN (ANALYZE, BUFFERS) 检验 WHERE title LIKE 'foo%' 是否使用索引。
```

PostgreSQL 的常见文本模式 operator class 是 `text_pattern_ops`（varchar 场景可评估 `varchar_pattern_ops`）；`btree_pattern_ops` 不是标准文本 operator class 名称。operator class 只解决相应排序规则下模式匹配的索引比较需求，可能不支持普通区域排序运算；请按列类型/collation 核实。大小写不敏感、任意位置 `%foo%`、语言学全文搜索需分别评估 `lower()` 表达式索引、`pg_trgm` GIN/GiST 或 `tsvector` GIN，而非盲目套用前缀索引。大表 `CREATE INDEX CONCURRENTLY` 不可在事务块中运行；完成后检查 `pg_index.indisvalid`。比较新增索引对写入延迟、磁盘和 vacuum 的影响。

### 8. 锁、长事务、连接、容量与超时 — 中高

**目的：** 发现资源耗尽和阻塞，并给查询/锁等待设置合理上限。

```sql
SELECT pid, usename, state, now()-xact_start AS xact_age,
       wait_event_type, wait_event, left(query,200) AS query
FROM pg_stat_activity
WHERE datname=current_database()
ORDER BY xact_start NULLS LAST;
SELECT count(*) AS connections,
       current_setting('max_connections') AS max_connections
FROM pg_stat_activity;
```

先在预生产按真实事务时长、连接池规模和 SLA 设值，再分角色设置示例：

```sql
ALTER ROLE app_runtime SET statement_timeout = '5s';
ALTER ROLE app_runtime SET lock_timeout = '1s';
ALTER ROLE app_runtime SET idle_in_transaction_session_timeout = '60s';
```

**通过：** 应用池最大连接数加上迁移、监控和运维连接峰值显著低于可用连接预算；慢事务、锁等待、磁盘/表空间、临时文件和连接数有告警及负责人。连接利用率、磁盘余量、锁等待/长事务、备份年龄/WAL 延迟、慢查询 p95 等阈值应由压测、基线与 RPO/RTO 决定，并明确观察窗口、负责人及升级路径。`ALTER ROLE SET` 需重新连接才影响新会话；云数据库参数及超时值依服务而定。先诊断阻塞链与事务所有者，不要自动批量杀会话。

### 9. 备份方式、保留、异地副本与 PITR — 高

**目的：** 将可接受数据丢失窗口（RPO）和恢复时间（RTO）映射到真实备份方案。

确认并记录：数据库/对象存储位置、加密、访问角色、每日/周/月保留数、异地/跨账号复制、删除保护、备份失败告警、责任人与最近成功时间。由平台 DBA 验证归档状态/延迟；在自管实例可参考：

```sql
SHOW archive_mode;
SHOW archive_command;
SELECT archived_count, failed_count, last_archived_wal, last_archived_time,
       last_failed_wal, last_failed_time FROM pg_stat_archiver;
```

PITR 的通用基础是**物理基础备份 + 从该备份所需起点起连续、可用的 WAL 归档**，并保留目标恢复点所需 WAL。`pg_dump` 逻辑备份不能仅靠“再保存 WAL”直接变成 PITR 链；它可用于逻辑恢复/迁移，须独立测试恢复时间。托管数据库 PITR 常由服务商编排，核实其保留窗口、时间点粒度和跨区域行为，勿直接假设能访问上述系统视图。

**通过：** 备份与 WAL 连续性覆盖目标 RPO；副本具备独立故障域/访问控制；有容量足够的保留期。只看到备份文件或 `pg_dump` 退出码为 0，不等于可实现目标 PITR。

### 10. 隔离环境恢复演练、完整性与 RPO/RTO — 高

**目的：** 实测备份可恢复并达到目标，不把“任务成功”误当成可用数据库。

1. 选最近一份符合保留策略的生产备份及对应 WAL（如采用 PITR），记录备份时间/目标时间点、加密密钥版本和操作者；使用隔离账号/网络恢复至隔离项目，禁止连回生产写入端点。
2. 恢复后核对 PostgreSQL 版本/拓扑、扩展、schema/migration 版本、角色和授权（避免恢复测试开放公网）；按预先定义的不变量比较关键业务记录抽样/汇总、行数、外键/约束、索引有效性、序列和只读应用冒烟。有外部附件对象存储时也要比对对象计数/校验和。
3. 若目标含 PITR，在隔离副本分别恢复到记录的目标时间点；确认恢复时间线、目标时间和 WAL 覆盖连续，记录日志。逻辑 `pg_restore` 流程应另行演练。
4. 计时：从故障声明到服务可验证（RTO）；记录最后恢复数据点与计划目标点之差（RPO）。与预先批准的目标比较；失败、数据不完整、超时则判定不通过，修正 runbook 后重演。
5. 删除/封存隔离副本按受控流程，保护演练数据；保留负责人、时间、命令/平台任务 ID、校验结果、用时、异常和改进项。

示例逻辑备份验证（仅用于逻辑备份流程，不代表 PITR）：

```sh
pg_dump --format=custom --file=community.dump "$STAGING_READONLY_DSN"
pg_restore --list community.dump
# 在隔离空数据库中恢复；连接串和备份不得写入共享日志。
pg_restore --exit-on-error --dbname="$ISOLATED_RESTORE_DSN" community.dump
```

### 11. 备份密钥、账号访问和告警 — 高

**目的：** 防止备份泄漏/被删除并及时发现备份链中断。

**执行：** 检查对象存储加密密钥轮换、最小读取/删除角色、生产与备份账号隔离、跨账号不可变保留（如平台支持）、审计日志、恢复密钥应急访问流程；至少验证一个非日常操作者在双人审批下能取得恢复密钥。监控最近备份成功时间、备份字节数、WAL 归档失败数与最长延迟、存储剩余空间、恢复任务失败和演练过期时间。

**通过：** 告警有阈值、收件责任人和升级路径；在隔离环境演练恢复密钥访问；备份角色不能任意修改生产数据。不要将 DSN、密码、密钥或含真实个人数据的样本贴入帖文/日志。

### 12. 上线变更门禁与复核留痕 — 中

对检查 1–11 建立表格记录：检查日期、数据库版本/托管平台和拓扑、执行账号/角色、脱敏 SQL、期望与实测结果、风险级别、修复负责人、复测证据、时间戳和审阅人。告警至少覆盖连接池利用率、磁盘剩余量、备份年龄/WAL 延迟、锁等待、长事务、慢查询 p95；阈值由压测和 RPO/RTO 设定，并写明观察窗口、负责人和升级路径。上线前由非实施者复核高风险 RLS、恢复演练和角色权限；存在高风险未通过、无法说明原因、恢复未实测或备份连续性未知时不放行。变更索引和参数先在预生产验证，再选低峰发布并监测锁、I/O、复制/WAL、错误率和回滚条件。

## 官方文档核对与明确修正

- 本清单参考 [PostgreSQL 当前版连续归档与 PITR 文档](https://www.postgresql.org/docs/current/continuous-archiving.html)、[Operator Classes and Operator Families](https://www.postgresql.org/docs/current/indexes-opclass.html) 和 [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)。截至本次核查，current 文档对应 PostgreSQL 18；目标环境若为其他版本，以该版本官方文档及托管平台能力为准。
- 官方 PITR 文档说明，`pg_dump`/`pg_dumpall` 是逻辑备份，不含 WAL 重放所需的文件系统级信息，不能作为连续归档恢复的一部分；连续归档恢复要有基础文件系统备份和从其开始所需的连续 WAL。
- 官方 operator class 文档列出 `text_pattern_ops`、`varchar_pattern_ops`、`bpchar_pattern_ops`，并说明它们按字符比较、适用于非 C locale 下 LIKE/正则匹配；普通范围比较通常仍需默认 opclass 索引。
- 官方 RLS 文档确认无策略时默认拒绝、所有者通常绕过但可用 FORCE 让 owner 受策略约束，而 superuser/BYPASSRLS 始终绕过。

修订说明：原帖中的 `btree_pattern_ops` 应视为错误；原帖提到“每日逻辑备份并结合 WAL 归档满足恢复点要求”的表述过度概括，不能说明 PITR；本补充已作更正。前缀 operator class 和 PITR 规则详见第 7、9 项。

1. 前缀索引示例使用 `text_pattern_ops`（按字段类型也可核验 `varchar_pattern_ops`），不能写成 `btree_pattern_ops`。
2. PITR 需要物理基础备份及其后连续可用的 WAL 归档。`pg_dump` 是逻辑备份，不能直接与 WAL 组合来获得 PostgreSQL PITR。
3. 本文提供的是可复核检查方法和示例，不代表已访问、扫描或更改该团队的数据库，也不代表购买或付款。任何实际生产结论都要由有权限的维护者按目标实例版本/架构人工复核。