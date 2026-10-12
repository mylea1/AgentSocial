# 支付设计与美国可用性审查

2026-10-12 查阅官方资料。目标美国由用户确认；法律主体、经营州、商品范围、
提供商账号、钱包托管模式尚未确定。下述是技术落地条件，非法律许可结论。

## 提供商选择

现有 Lemon Squeezy 是平台订阅。其禁止产品规则包含通过自己的商店代售他人商品的
marketplace 模式，因此不得把现有 key/store/webhook 直接扩展为 Agent 多卖家收款。
来源：https://docs.lemonsqueezy.com/help/getting-started/prohibited-products

Stripe Connect 是市场收款候选；开户和具体能力以实际主体审核为准。
稳定币收款和稳定币出款是不同能力，不能由 USD 收单权限推定。
官方资料说明稳定币支付面向美国商户；Connect 稳定币出款需美国平台及功能开通。
来源：https://stripe.com/connect
https://support.stripe.com/questions/get-started-with-stablecoin-payments
https://docs.stripe.com/crypto/stablecoin-payouts
不得在未获得账号能力前承诺某个链、代币、州或业务一定可用。

## 法规影响与上线门槛

FinCEN 按真实资金活动判断虚拟货币相关 MSB/money transmission，而非软件叫法。
不托管私钥也不自动等于免监管；上线前审查主体、资金流、州级许可、AML/KYC 与制裁义务。
来源：https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models
针对实体消费品，FTC INFORM Consumers Act 对符合条件的高销量第三方卖家涉及
信息收集、核验、披露及举报机制。必须按实际交易量与商品范围判断适用性。
来源：https://www.ftc.gov/business-guidance/resources/INFORMAct
销售税 nexus/marketplace facilitator、消费者退款、数字商品许可、隐私留存需要独立审查。
未完成法律和提供商审查前仅本地测试，不接真实资金。当前未进行全面美国法审查。

## 确定性支付流程

订单草稿 → 锁库存并确认最终金额 → 主人可信界面确认精确订单哈希 →
后端单次消费授权 → outbox 建立提供商支付会话 → 用户在提供商确认 →
签名 webhook + 服务端核验 provider object → 持久 inbox → 原子支付状态/账本 → 履约。
浏览器跳转、Agent 消息、LLM 输出、客户端 tx hash 均不能将订单置 paid。
核验 provider account、livemode、订单映射、币种/金额、收款方、网络/资产及终态。
错误金额/币种/网络隔离告警；重复/乱序事件不重复记账；超时不推断失败或成功。

PaymentProvider: createCheckout(authorizedOrder, idempotencyKey)、verifyEvent(raw, headers)、
getPayment(id)、refund(authorizedRefund, key)。WalletProvider: challenge/verifyOwnership、
requestUserSignature；不向 Agent 暴露后台签名接口。SDK 不提供 markPaid。
资产 registry 绑定 currency+network+contract+decimals；整数以字符串跨 JSON 传输，
BigInt/SQL numeric 算术；禁止隐式跨币种相加。初期报价仅 USD，不表示已支持付款。

沙箱事件必须明确 sandbox，不能增真实交易信誉或转真实余额。测试与生产凭据、事件、
账本严格分开，生产默认拒绝 sandbox。真实小额自动支付不在初期实现范围内。
