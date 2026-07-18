# Decision Log — Portal Operacional Delta (Schedule_Portal)

The contract in this repo is frozen at gates. Every change to the frozen stack or
domain model is recorded here with a version bump (Regra de Ouro, see README.md).

---

## G0 — Contract frozen (2026-07-17, upload)
Initial shared contract: NestJS + PostgreSQL + Redis/BullMQ + S3 + WebSocket,
self-hosted. Artifacts: `glossary.md`, `data-model.md`, `permissions-matrix.md`,
`events.md`, `service-state-machine.md`, `openapi.yaml`.

---

## G1 — Execution layer pivot to Supabase-native (2026-07-17)
**Approved by:** Eder (owner), in chat.
**Motivation:** cost + consistency. Running NestJS + Redis + S3 as its own
infrastructure adds ~$10+/mo and duplicates auth/storage/realtime that Supabase
already provides. All other Delta Pro Clean apps are React + Vite + Supabase.

**What changes — execution layer only. The domain model is unchanged.**

| G0 (self-hosted) | G1 (Supabase-native) |
|---|---|
| NestJS REST API (`openapi.yaml`) | PostgREST auto-API + Edge Functions for business logic |
| Own PostgreSQL | Supabase Postgres, schema `schedule_portal` inside project `sryywirmhohrdsssujwf` ("support@deltaproclean.com's Project") |
| Redis + BullMQ (async exports, integration queue) | queue tables + `pg_cron`/Edge Functions |
| Hand-rolled WebSocket | Supabase Realtime (Postgres changes) |
| S3 + antivirus + thumbnails | Supabase Storage (bucket `schedule-attachments`) |
| Custom `users` table (password_hash, mfa, lockout) | Supabase Auth (`auth.users`); local `memberships` holds role/region/access |

**Still authoritative from G0:** `glossary.md`, `data-model.md` (entities/fields),
`permissions-matrix.md` (RBAC), `service-state-machine.md`, `events.md`. Only the
transport/infra maps onto Supabase primitives.

**Data model adaptations (documented, within G1):**
- G0 `users` table is dropped — Supabase Auth (`auth.users`) owns identity, 2FA,
  lockout. `memberships.user_id` references `auth.users(id)`.
- Multi-tenant `organization_id` is retained on every table for fidelity, though
  there is effectively one org (Delta Pro Clean) today.
- `version` optimistic-concurrency columns are retained; conflict handling moves
  to Edge Functions / RPCs that return the server object (409 equivalent).

**Hosting decision:** schema `schedule_portal` in the shared project
`sryywirmhohrdsssujwf`. This project already hosts Check List App (prod, 199 users),
Expense Portal, and the sheets→Supabase sync. `auth.users` and `public` are shared
across all of them, so **Schedule_Portal keeps ALL its objects in its own
`schedule_portal` schema** and never touches `public.*` or existing global functions.

---

## G1.1 — Realized build & review fixes (2026-07-17)
The G1 app was built and taken end-to-end against real Supabase.

**Front-end:** all 9 screens from the Claude Design handoff ported to React (Login,
Gallery, Board, Card modal, Roster/Employees, Members+RBAC, Exports, Integration,
Audit). Data layer (`src/lib/api.js`) switches mock ↔ Supabase by env.

**Verified against real Supabase:** publishable API key (the legacy `anon` JWT is
disabled on this project), `schedule_portal` exposed, migrations applied, membership
seeded → auth + provisioning + board read + create (RLS) all working.

**Roster → board auto-generation:** creating a board now auto-generates the pool list
plus one column per active employee in `schedule_portal.workers` (per the G0 spec
"new board creates one list per active worker"). The Employees screen persists to
`workers`. Demo caps generation at 40 columns.

**Review fixes** (from the PR self-review) applied in code and in
`0005_review_fixes.sql`: real-mode creates now set `organization_id`/date/month/
position; `getBoardDetail` returns `vendors`; empty-gallery guard; status/loading
guards; audit-insert policy removed (RPC-only, non-forgeable); `done` no longer resets
on invoiced/paid.

**Deferred (documented, not blocking):** Realtime, attachment upload UI, wiring the
admin screens to real endpoints, finer RBAC region/role enforcement in RLS.
