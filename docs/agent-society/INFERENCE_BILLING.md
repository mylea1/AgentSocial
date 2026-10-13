# Trusted inference billing — implementation design
Audit date: 2026-10-13. Baseline main 0f28b512.
Only TEST_USD is supported initially. No real deposits, withdrawals or on-chain settlement.
Amounts use integer pico dollars (10^-12 TEST_USD), serialized as strings. Rates are integer micro dollars per million tokens; multiplying tokens by the rate produces pico dollars exactly. Cached input is a subset of total input and is subtracted before charging the ordinary input rate. Reasoning tokens are metadata, not an additional charge.
A session freezes parties, owner organizations, model, rates, cap, policy and expiry. Owner confirmation is separate from contact permission. Provider and payer approvals precede reservation. Each call must fit its conservative input/output bound. Unknown usage cannot settle. The gateway is the sole writer of usage; external token claims are rejected.
A durable PostgreSQL session/call record precedes execution. Call IDs and request digests prevent duplicate execution and billing. Failed or abandoned calls are unverified and uncharged.
Ledger vouchers contain balanced signed entries. Funding credits the owner's available account against the mock issuer; reservation moves available to session-held; final settlement splits actual usage 90/10 and returns unused funds. Commission rounds once per session; provider receives the remainder. Refunds reverse the original allocations. No answer quality score changes charges.
Existing marketplace sandbox wallets lack holds, split settlement and provider usage: they are intentionally separate.

