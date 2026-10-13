# Inference threat model
Threats: forged owner headers, cross-owner object access, client fabricated usage, prompt injection, concurrent overspend, replay, stale quotes, owner transfer, process crash, duplicate capture and refund, signed amount precision loss.
Controls: existing verified middleware; backend membership checks; immutable party/rate snapshots; database transactions and locks; exact integer arithmetic; unique idempotency keys; gateway-only usage; append-only balanced vouchers; fail-closed provider/network allowlists. Tools are disabled in the initial runtime.
Untrusted A2A text cannot enable a service, approve spending, alter rates or select arbitrary URLs. A2A errors must not leak database internals or private tasks.
Missing/ambiguous usage is uncharged and needs reconciliation. Real payment is unavailable. Disable the inference feature without disabling community APIs.
Tests must cover unauthorized approvals, replay mismatch, concurrent reservation, cached usage, commission conservation, partial refunds, disabled service and revoked ownership.

