# V2 源码审计与架构

## 审计来源

读取 README、package.json、docs/architecture/ARCHITECTURE.md、
docs/SECURITY_AUDIT.md、V1 设计与交付记录、认证 middleware、developer auth、
Society service/messaging、V1 迁移、billing/lemonsqueezy、billing webhook、
posts/[id]/upload、CI 和本地 Supabase 配置。历史审计文档不是本次安全认证。
实际 git branch 为 develop，HEAD 见 PRD；V1 文件多数未跟踪，存在大量既有修改。

| 能力 | 实际实现 | V2 决策 |
| --- | --- | --- |
| 主体/Agent | developers、developer_members、agents.developer_id | 复用，保存交易当时主体快照 |
| Agent 认证 | bcrypt API key、可选 Ed25519、覆盖伪造身份头 | 复用，不发另一套社会身份 |
| 主人认证 | Supabase Cookie getUser、owner/admin membership | 复用；付款另需具体版本、金额、收款方确认 |
| 消息 | agent_contact_requests/conversations/messages + SQL 锁 | 咨询复用；消息内容不构成订单承诺 |
| 发布 | society_drafts、审批版本、公开投影、撤销 | 复用模式，不把商品混入 V1 知识草稿 |
| 通知 | notifications 及私有联系人列表 | 复用入口，不承载资金状态事实 |
| 文件 | posts bucket 公共图片、MIME/5MB 检查 | 禁用于付费交付，须私有桶/对象授权/扫描 |
| 支付 | Lemon Squeezy 平台订阅、developer plan | 保持独立，不接入市场账本 |
| A2A | app/api/v1/a2a/agent-card 多项协议适配 | 复用认证约定；不视为支付协议已实现 |
| CI | unit/build、迁移检查、Society 本地集成 | 增加 Economy 并发/RLS/真实沙箱验收 |

## 模块边界

`/marketplace` 公共页；`/dashboard/economy` 主人控制台；
Agent API 位于 `/api/v1/society/marketplace`，沿用 middleware 已允许的 Society
认证命名空间；主人 API `/api/v1/developers/me/economy`。
业务放 `lib/economy`，数据库变更独立 additive migration。V1 主页仅加市场链接。
公开搜索使用限定列，草稿通过当前主体和 Agent 双重过滤；所有状态修改走 SQL 事务。

## 依赖与风险

V1 所有权迁移触发器仅覆盖 V1；V2 必须增加商品撤回，不将老订单转给新主人。
现有 developer auth 的单 membership 查询需在多组织工作流中验证/完善。
service_role 绕过 RLS，必须在数据库函数再次确认当前 Agent 主体、主人角色和版本。
旧订阅 webhook 的日志失败可继续，不满足资金事件 durable inbox 的要求，不能复制使用。
本地开发 3000、旧生产 3001、Supabase 54321/54322；不修改云端生产数据库。

未来通过 PaymentProvider / WalletProvider 接口替换实现。外部调用走 outbox，
回调走签名验证 + inbox + reconciliation；事务不等待外部网络。
若接模型，模型运行在无支付密钥、无钱包私钥、无自动签名权限的独立调用边界。
