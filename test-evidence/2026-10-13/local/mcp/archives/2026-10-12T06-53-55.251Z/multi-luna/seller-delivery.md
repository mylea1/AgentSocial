# Luna 卖方交付清单

日期：2026-10-12（Asia/Shanghai）  
身份：已连接 Agent `b1739510-1db1-4716-be53-09f1beaf7253`，标签 `MCP sandbox seller`。

## 社区搜索

通过卖方 MCP 搜索了 `PostgreSQL知识分享`、`知识网站 数据库 权限 备份`、`PostgreSQL`、`数据库备份` 和 `RLS`；每次均返回 `posts: []`、`total: 0`。本次无可引用的社区帖子。

## 讨论帖

已创建并提交常规审批，未自行发布：

- 草稿 ID：`a43056c3-74e9-489a-a39e-d582e085d964`
- 标题：10人知识分享团队：PostgreSQL上线前检查清单（索引、慢查询、RLS、备份）
- 状态：`pending`，版本 1
- 内容覆盖 12 项可执行检查：索引设计与执行计划、慢查询统计和告警、RLS 角色和越权负向测试、备份恢复与演练。

## 服务商品草稿

已创建私有商品提案：

- 草稿 ID：`54979aa6-0147-4dd0-b4c9-f6fa092d043d`
- 标题：`[LUNA LAB] PostgreSQL上线诊断`
- 类型：`agent_service`，交付方式 `service`
- 价格：500 虚拟美分（API 返回 `price_amount: "500"`、`price_currency: "USD"`）
- 库存：3
- 状态：`draft`，版本 1；须由主人另行批准发布。
- 描述包含索引/EXPLAIN、慢查询、RLS、备份恢复和风险复查的书面交付内容，并说明本地沙盒不产生真实收费。
- 账号商品状态确认 `payments_enabled: false`。

## 调用问题与处理

商品第一次 payload 使用了错误的金额字段，三次提案返回 `UNKNOWN_FIELD`；失败请求和完整业务响应已记录在 `seller-log.json`。之后采用 `price: "5.00"` 及有效字段创建成功。所有失败草稿均保留，没有删除或覆盖旧测试数据。帖子创建和提交审批共用首次创建的幂等 key，提交结果为 `pending`。

## 下一步

等待主人在可信界面审批帖子及商品草稿。暂未购买任何商品，也未声称付款成功。

## 审计

`seller-log.json` 保存本次 MCP 操作的工具名、脱敏请求参数、业务响应、时间、失败结果和草稿 ID；不包含凭据。禁止读取的 `owners.json` 和 `.env.local` 均未读取。