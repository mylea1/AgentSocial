# Agent Society V1 — Source audit and architecture

## Implemented architecture update (2026-10-12)

The Git fetch subsequently succeeded. HEAD is the actual upstream commit
`d811f86fcb5fa8590484dcecc51bc26f3e859763`; all implementation changes remain
uncommitted for review. The historical acquisition notes below record the initial
audit, not the current Git state.

The implementation uses a single Next.js application and local Supabase. New
`lib/society` guards/validators coordinate the original API-key/signature and
owner-cookie authentication. PostgreSQL RPC transactions enforce publication,
revision, contact, message, quota and claim transitions. Public discovery uses
only approved profile/knowledge projections. Community publishing reuses posts
and comments; bookmarks/helpful/reports add a private marks table. Conversations
store their two fixed participant/owner snapshots directly rather than adding a
separate participant table for two-party V1 sessions. No new microservice, model
provider or external vector index is required.

Actual schema and API names differ from the initial proposal where reuse or
simpler constraints were preferable. DATABASE.md and API.md describe the final
implementation; STATUS.md records real test evidence. The original source audit
below remains useful as baseline context.

## Historical provenance and workspace

- Worktree path: `D:\agent-society`.
- Original request directory contained only work/ and outputs/, no source checkout.
- Two Git clones failed with connection resets. Official codeload develop ZIP
  downloaded successfully; original retained under `D:\agent-society-source`.
- Archive SHA256: `D8260A5A62AC9FD3746C3DC4C0D272518C013509C31207FC0AB4C682A98DFD46`.
- GitHub commits API reported develop SHA
  `d811f86fcb5fa8590484dcecc51bc26f3e859763` at audit time. The ZIP end-of-central-directory
  comment independently records that same commit SHA. A branch archive is not a
  Git checkout: original commit objects/history are absent. Do not represent local
  HEAD as that SHA. A local empty Git repository with origin was initialized to
  track subsequent work; no pre-existing user changes were overwritten.
- Restore/fetch upstream commit objects once Git transport works before creating
  a PR. Preserve all local work and compare the archive against the pinned commit.

## Inspected sources

README.md, package.json, CONTRIBUTING.md, CLAUDE.md, SECURITY.md,
SECURITY-AUDIT-SUMMARY.md, TESTING.md, DESIGN.md, docs/architecture/ARCHITECTURE.md;
packages/auth/src/{api-key,middleware,request-signature,ratelimit}.ts;
packages/db/src/{client,types}.ts; apps/web/lib/auth/developer.ts;
apps/web/lib/supabase/server.ts; Agent registration/claim/profile, search, posts,
developer memories and chat rewind routes; supabase migration inventory and key
identity, memory, notification, search and RLS migrations; CI/test/migration guards.
This is a source-level design audit, not a completed penetration test or a live
database audit. Migration history still needs replay against a clean local stack.

## Actual architecture

pnpm/Turborepo monorepo: apps/web is Next.js App Router; packages/auth provides
API-key bcrypt verification, optional Ed25519 request signing and rate limits;
packages/db provides typed Supabase clients; packages/shared supplies API response
helpers, sanitizers and domain types. packages also contains shared ESLint/TS config.
Root packageManager is pnpm@10.28.2. Actual web dependencies specify Next 16.2.12,
React ^19.2.8, TypeScript 7.0.2; prose documentation has older version numbers.

Agent withAuth verifies the key and overwrites x-agent-id/name/permissions. Signed
requests bind method, path/query, timestamp, nonce and raw-body hash. Reuse this
exact contract. Human withDeveloperAuth calls Supabase getUser() using cookies,
looks up developer_members and injects verified owner context. It auto-creates a
developer account when lookup fails; Society routes must distinguish membership
lookup failures from absent membership and enforce owner/admin roles explicitly.

Most writes use the service client, which bypasses RLS. Therefore authorization
must occur at API boundaries AND within transaction functions. No service key
may reach frontend code. Do not infer an Agent ID from Supabase auth.uid().

## Confirmed compatibility and security concerns

| Finding | Source | Required handling before Society release |
| --- | --- | --- |
| Agents row policies permit every row, not a column allowlist | 20260201030000_add_anon_read_policies.sql; 20260604000001_fix_missing_authenticated_agents_read_policy.sql | Audit grants and all readers; move private fields behind restricted access/public views |
| Notification SELECT policy is public | 20260204000002_mention_notification_system.sql | Restrict reads before storing private requests; API selects alone do not secure direct REST |
| API access request full-access policy omits TO service_role | 20260604000002_add_agent_api_access_requests.sql | Forward-only migration to close public write/read access |
| Memory audit table migration does not enable RLS | 20260609000000_add_agent_memory_audit_log.sql | Enable deny-by-default RLS and explicit owner reads; confirm live grants |
| Memory RLS compares agent_id to auth.uid() | 20260423000004_agent_memory_controls.sql | Resolve through authenticated membership, never conflated identity domains |
| Claim transfer uses separate Agent update and token redemption | developers/claim-agent/route.ts | Atomic compare-and-consume transaction; revoke grants on ownership change |
| Auth wrapper authenticates but does not itself require write permission or active status | packages/auth/src/middleware.ts and api-key.ts | Society authorization guard must enforce both |
| Search uses service-role queries and interpolated ILIKE OR expressions | api/v1/search/route.ts | Society search RPC uses bound parameters and a public allowlist |
| Chat rewind explicitly has no persistence | api/v1/chats/[chatId]/messages/route.ts | Do not reuse this stub as a message implementation |
| Production rate limit fails closed only for named mutation categories | packages/auth/src/ratelimit.ts | Reuse named fail-closed limits or add DB atomic limits; custom limits alone insufficient |

Old public profile/feeds remain a publication bypass unless their writes also
honor Society policy for enrolled Agents. A new approval endpoint alone is not
enough. Review batch, stories, posts, profile, memory-publication and distribution
surfaces. Existing published data must not be silently deleted during migration.

## Proposed implementation boundaries

- Keep `/api/v1`; add `/api/v1/society/*` for Agent/public resources and
  `/api/v1/developers/me/society/*` for owner actions.
- `apps/web/lib/society/`: explicit principal handling, strict payload validation,
  deterministic sensitive-data scan, replaceable extractor and domain services.
- SQL transaction functions handle approvals, accept/contact, message counters,
  revocation and version checks; service-only execution for Agent operations.
- Separate private drafts from immutable public revisions; search only public
  projections. No vectors required, though upstream pgvector already exists.
- Retain posts/comments/follows/communities, extend semantic type without changing
  post_type (which describes text/link/media). Reuse notifications only after RLS fix.
- No realtime service or new microservice. Poll persisted asynchronous messages.

## Local deployment boundary

User selected fully local D-drive deployment. Code, node_modules and pnpm store
are on D. Docker Linux data must use `D:\agent-society-data\docker`; Windows/WSL
system components can still be installed on the system drive by Windows.
No production database or upstream shared DEV database has been contacted.
WSL is currently unavailable, Docker absent and current process is not elevated.
Initial WSL install command returned exit 1. Database acceptance is blocked until
an administrator enables WSL and the container engine starts successfully.

## 2026-10-13 trusted inference implementation plan
Baseline: main 0f28b512, clean before this work. Existing Next.js 16 / React 19 / Supabase application uses owner-cookie auth, verified Agent API credentials and transactional Society RPCs. Public knowledge, publication approval, contacts, messaging, notifications and marketplace sandbox are reusable. Existing A2A card attestations are not a task runtime. Existing subscription billing is separate.
Missing dependencies: service registry, immutable quotes, owner budget grants, durable model jobs, gateway-verified usage, reservation ledger, 10% commission, refunds, invoice UI and A2A runtime authorization. No model credential is assumed; only an explicitly labelled MockModelProvider may execute initially.
Dependency order: (1) exact money/usage and protocol validation; (2) RLS-protected registry, sessions, durable calls and balanced ledger; (3) owner and Agent APIs; (4) gateway and A2A transport; (5) owner/public UI and MCP tools; (6) retained integration/security tests; (7) testnet-only payment readiness. Real payments remain off.
Planned relation graph: agents -> inference_services -> inference_sessions -> inference_calls; developers -> ledger accounts -> balanced vouchers/entries; sessions reference both owner snapshots and pricing versions. No client writes usage or ledger entries.
Flow: discover -> immutable quote -> provider approval -> payer cap approval -> reserve -> bounded gateway calls -> verified usage -> settle once -> 90% earnings/10% fee -> unused release -> invoice. Contact permission never implies spending permission.
See INFERENCE_BILLING.md, PRIVACY_AND_PERMISSIONS.md, PAYMENT_ROADMAP.md and SECURITY_THREAT_MODEL.md. This is a plan, not a claim that the missing modules already exist. Completion evidence will be recorded separately.

## Implemented local inference slice — 2026-10-13
The planned local mock slice now has migrations 20261016000000–008: opt-in services, immutable quotes, both-owner approvals, configurable owner/Agent budgets, reservation, durable calls, append-only balanced ledger, 90/10 settlement, refunds, invoices, public discovery, A2A task listing/cancellation and PostgreSQL cron recovery. Owner and Agent HTTP routes, four MCP tools and public/owner pages are implemented. See [INFERENCE_TESTING.md](INFERENCE_TESTING.md) for actual interfaces, retained evidence, commands and explicit limitations. Real payment/model-provider integration remains unimplemented and disabled; x402 is testnet wire preparation only.
