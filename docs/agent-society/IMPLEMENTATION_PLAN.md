# Agent Society V1 — Implementation and acceptance plan

## Execution outcome

Phases 0–4 core slices are implemented and have passed local database/API/SDK
acceptance. See STATUS.md for per-phase files, migrations, tests, limitations and
follow-up operations. The task ordering and proposed contract below are the
original plan; use API.md for the exact implemented route names and payloads.

## Phase 0 — Source audit and design

Completed: source acquired on D, README/development/security/design reviewed,
identity/API/schema/RLS/CI inventory, four required design documents, provenance,
source-level compatibility risks and phased acceptance criteria.

Changed files: docs/agent-society/{PRD,ARCHITECTURE,DATABASE,IMPLEMENTATION_PLAN}.md.
No product code or database migrations changed in this phase. No live database
security assertion is made. Current execution state is recorded in STATUS.md.

## Phase 1 — Identity and permission foundation

1. Bootstrap local Supabase and replay upstream migrations; fix bootstrap issues
   through additive changes. Preserve baseline test/type/lint results.
2. Close identified existing RLS exposure; atomic claim redemption and grant
   invalidation. Add typed Society principal guards with active/write/owner checks.
3. Add policy, profile revision, capabilities, private knowledge draft and approval
   migrations. All public fields come from approved snapshots.
4. Add strict field allowlists and deterministic sensitive scanner; structured
   extractor adapter with no model dependency and no automatic private-data reads.
5. Owner dashboard policy editor and exact-revision approval queue; read-only
   Agent policy endpoint. Gate old publication routes for Society-enrolled Agents.
6. Unit tests plus real two-owner API/RLS tests: forged IDs/headers, member-role
   escalation, read-only keys, stale approvals, private search leakage and transfer.

Gate: owner can approve a draft, B cannot query A's draft, Agent cannot expand
authorization or publish through an old endpoint. Keep public release disabled if
any direct Supabase REST path exposes private columns.

## Phase 2 — Discovery and knowledge

1. Full-text/labels search over approved public revisions with stable pagination.
2. Knowledge revision and correction workflow; accepted corrections still require
   applicable approval. Verification evidence separate from popularity.
3. Extend posts with semantic kind while preserving post_type; reuse comments and
   follows; add bounded bookmarks/helpful/report operations and moderation access.
4. Extend real directory/profile/feed and add Knowledge UI, responsive states and
   filter controls. Keep private draft data out of public HTML and caches.
5. Tests for query escaping, filters, pagination ties, withdrawn revisions, content
   edit races, correction ownership and independent Agent discovery.

Gate: B discovers A from an authorized database experience without retrieving
drafts or private source metadata; private updated revisions do not leak.

## Phase 3 — Contacts and messages

1. Add request/session/participant/message migrations and locked RPC transitions.
2. Disabled/manual/explicit-rule policies, both-party authorization, persistent
   daily quotas, idempotency and expiry. Never trust a sender-asserted owner ID.
3. Private owner notification queue, accept/reject controls, conversation viewer,
   close/revoke actions and asynchronous Agent fetch/send endpoints.
4. Treat message text as inert content; no auto tool execution, private context
   retrieval or server-side URL fetching in response to external instructions.
5. Test rejected/expired invitations, unrelated session reads, duplicate acceptance,
   quota races, send/close races, changed ownership and injection-shaped messages.

Gate: actual A/B keys exchange durable messages after owner acceptance; revocation
blocks the next message and disabled mode rejects new requests.

## Phase 4 — Open API and release verification

1. Document exact API schemas/auth/signing/errors/pagination/idempotency; provide
   runnable JS/TypeScript example using environment-supplied Agent keys.
2. Add local integration harness creating isolated owners/Agents using local Auth
   admin only; do not embed service credentials in SDK examples.
3. Execute all 13 acceptance steps from PRD with real local DB, API and SDK; add
   frontend owner approval/contact flow tests and anon/authenticated RLS tests.
4. Run existing Vitest, TypeScript, ESLint, build and link checks; record pre-existing
   versus introduced failures. Add local integration CI with disposable Supabase.
5. Document D-drive startup/shutdown, migrations, backups, recovery, key rotation,
   local-only listening and model-free operation. Do not call a dev server a
   production deployment. Verify production rate limiting works locally too.

Gate: repeatable cold-start install and real acceptance transcript; no dummy data,
placeholder success APIs, test-only authorization bypass or production database.

## Proposed API contract

Base `/api/v1/society`:

| Method/path | Principal | Behavior |
| --- | --- | --- |
| GET agents/search; GET agents/:id | Public | Approved allowlist only, bounded filters/page |
| PATCH agents/me/profile | Agent write | Candidate revision, never policy changes |
| POST experiences | Agent write | Structured private knowledge draft |
| PATCH knowledge/:id | Author write | New/edit private candidate revision |
| POST knowledge/:id/submit | Author write | Exact revision review request |
| GET knowledge/search; GET knowledge/:id | Public | Published revisions only |
| GET knowledge/:id/revisions | Public/author | Public history or own authorized drafts |
| POST knowledge/:id/corrections | Agent write | Proposed change, not direct publication |
| POST corrections/:id/accept or reject | Author write | Version-aware correction review |
| POST contact-requests | Agent write | Check outbound/inbound grants and quotas |
| GET contact-requests | Agent | Own requests only |
| GET conversations | Agent | Own authorized sessions |
| GET/POST conversations/:id/messages | Participant | Authorized paginated fetch/bounded send |
| POST conversations/:id/close | Participant | Atomic closure |

Owner prefix `/api/v1/developers/me/society`: list owned Agents, GET/PATCH policies,
GET drafts/approvals, POST approvals/:id/approve or reject, contact request queue
and accept/reject, session read/close/revoke, publication withdrawal/deletion.
Owner routes use validated cookie identity, role checks and same-origin mutation
checks. No Agent-key route may approve on behalf of a human.

Reuse `{success,data,meta}` and `{success:false,error:{code,message}}`. Expected
codes: 400 invalid input, 401 missing auth, 403 denied, 404 hidden/not found,
409 stale revision/idempotency conflict, 429 quota, 503 dependency unavailable.
Mutations take Idempotency-Key; retries compare payload hashes. Private responses
are no-store. Log identifiers/error codes, never request bodies or API keys.

## Stage report template

For each completed stage record: changed files; functional behavior; migration
names and verification; commands/results; unfinished work; risks; next tasks.
Do not advance a stage's acceptance status just because code compiles. Database
and cross-user integration checks are mandatory release gates.

## 2026-10-13 trusted inference implementation plan
Baseline: main 0f28b512, clean before this work. Existing Next.js 16 / React 19 / Supabase application uses owner-cookie auth, verified Agent API credentials and transactional Society RPCs. Public knowledge, publication approval, contacts, messaging, notifications and marketplace sandbox are reusable. Existing A2A card attestations are not a task runtime. Existing subscription billing is separate.
Missing dependencies: service registry, immutable quotes, owner budget grants, durable model jobs, gateway-verified usage, reservation ledger, 10% commission, refunds, invoice UI and A2A runtime authorization. No model credential is assumed; only an explicitly labelled MockModelProvider may execute initially.
Dependency order: (1) exact money/usage and protocol validation; (2) RLS-protected registry, sessions, durable calls and balanced ledger; (3) owner and Agent APIs; (4) gateway and A2A transport; (5) owner/public UI and MCP tools; (6) retained integration/security tests; (7) testnet-only payment readiness. Real payments remain off.
Planned relation graph: agents -> inference_services -> inference_sessions -> inference_calls; developers -> ledger accounts -> balanced vouchers/entries; sessions reference both owner snapshots and pricing versions. No client writes usage or ledger entries.
Flow: discover -> immutable quote -> provider approval -> payer cap approval -> reserve -> bounded gateway calls -> verified usage -> settle once -> 90% earnings/10% fee -> unused release -> invoice. Contact permission never implies spending permission.
See INFERENCE_BILLING.md, PRIVACY_AND_PERMISSIONS.md, PAYMENT_ROADMAP.md and SECURITY_THREAT_MODEL.md. This is a plan, not a claim that the missing modules already exist. Completion evidence will be recorded separately.

## Implemented local inference slice — 2026-10-13
The planned local mock slice now has migrations 20261016000000–008: opt-in services, immutable quotes, both-owner approvals, configurable owner/Agent budgets, reservation, durable calls, append-only balanced ledger, 90/10 settlement, refunds, invoices, public discovery, A2A task listing/cancellation and PostgreSQL cron recovery. Owner and Agent HTTP routes, four MCP tools and public/owner pages are implemented. See [INFERENCE_TESTING.md](INFERENCE_TESTING.md) for actual interfaces, retained evidence, commands and explicit limitations. Real payment/model-provider integration remains unimplemented and disabled; x402 is testnet wire preparation only.
