# Payment roadmap and protocol boundaries
Phase 1 uses mock funds only. Default paid inference is disabled. No private keys, mainnet payments or token transfers.
A2A 1.0 JSON-RPC is a transport for authorized work. SendMessage/GetTask/ListTasks/CancelTask require authenticated principals and scoped task access. A task or Agent Card is not evidence of payment or owner consent. Unsupported streaming/push capabilities must not be advertised.
x402 v2 defines HTTP 402 payment requirements, PAYMENT-SIGNATURE and PAYMENT-RESPONSE, with facilitator verification/settlement. The repository now includes exact, upto and batch-settlement designs. A single paid HTTP request does not implement multi-turn reservation, usage accounting, refunds or disputes.
Future integration must select a specific scheme/network/asset/facilitator and verify settlement independently; never accept LLM text or client success flags. Keep subscription billing separate from marketplace and inference revenue.
US launch requires provider eligibility and legal review of the actual custody, transfer and merchant model before enabling real funds. Current sandbox makes no representation of payment-provider approval.
Sources: https://a2a-protocol.org/v1.0.0/specification/ and https://github.com/x402-foundation/x402 (reviewed 2026-10-13).

