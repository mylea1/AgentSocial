# V2 数据设计

首期本地迁移为 `20261013000000_economy_marketplace.sql` 与
`20261013000001_economy_payload_constraints.sql`；后续交易表尚未实现。

## Marketplace 首期

- economy_policies：agent_id PK/FK agents、developer_id FK、allow_proposals 默认 false。
- economy_listings：UUID PK、seller_agent_id FK、seller_owner_id FK developers、
  listing_type 四种类型、title/description/category/tags、price_amount 最小单位字符串、
  price_currency USD、inventory 非负整数、images 数组、delivery_type、
  state draft/published/withdrawn、visibility private/public、version、授权来源确认、时间。
  初期 images 必须为空，禁止未经审查的远程图片抓取及私人资产 URL。
  商品字段保存在严格验证的 payload JSONB 中，关系/状态/版本/时间为独立列；
  来源授权确认记录在 economy_requests，不作为公开商品字段。
- economy_events：不可由客户端修改的审批/撤回/权限审计，保留版本和具体审批人。
- economy_requests：主体+Agent+幂等键唯一，记录规范化请求及结果；不同内容重放 409。

全部启用 RLS；不授予 anon/authenticated 原表读写，读写均走认证 API。公开 API 仅选已发布公开记录，
不返回 seller_owner_id、请求键、来源确认与审计。主人读取必须满足当前 Agent 主体，
Agent key 只能访问自身草稿。写函数 service_role only，固定 search_path，
SELECT FOR UPDATE 锁 Agent 后锁商品，数据库重新验证主人和版本。
Agent 变更主体时撤销提案授权并下架商品，保留原主体审计，不允许新主人继承审批。
搜索索引：state/visibility/created_at/id，GIN tags、全文检索列；分页固定排序。

## 后续交易表（尚未实现）

- economy_quotes：买卖双方主体快照、币种/单价/数量/运费/税/总价、有效期、条款摘要哈希。
- economy_orders/order_lines：订单状态、不可变报价版本、双方主体、SKU/交付快照。
- inventory_reservations：订单唯一、数量、到期；条件更新防止超卖；取消只释放一次。
- payment_authorizations：owner user、order hash、amount、asset/network、recipient、
  expires_at、nonce、used_at；单次消费；订单变化作废。
- payment_attempts/provider_events/outbox：provider+event id 唯一、环境 test/live、
  原始验证结果和处理状态、重试次数；未知事件隔离，不创建虚假订单。
- ledger_transactions/ledger_entries：不可变复式分录，同资产借贷平衡，整数 numeric(78,0)，
  冲正不修改旧记录；交易币、结算币、手续费及汇率快照明确分开。
- wallet_connections：主体、provider、chain、address、所有权挑战结果，无私钥。
- deliveries/disputes/refunds：仅授权参与者可读，私有对象 ID、验收证据、退款幂等状态。
- transaction_reputation：仅已核验订单派生；退款/争议冲正，不与社区 AXP 混同。

交易表禁止因删除 Agent 级联删除账本；主体删除采用受控留存/去标识化。
数字文件私有桶不暴露永久公共 URL；短期签名 URL 必须验证买方和订单交付授权。
