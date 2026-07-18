# Backend Implementation Guide — Claude Code

This is the executable plan to make the Portal Operacional Delta backend work,
matching the approved front-end prototype and the frozen `/contracts`.

## 0. Ground rules
- **Contract-first.** `contracts/openapi.yaml` is authoritative. Generate DTOs/types from it; write contract tests that validate every response against it.
- **Naming is frozen.** Use the exact names in `contracts/glossary.md` in code, API and DB.
- **Audit everything.** A global interceptor writes an `AuditEvent` for every state-changing request from day 1.
- **Multi-tenant.** Every row carries `organization_id`; every query is scoped by it.
- **Optimistic concurrency.** `version` on boards/lists/cards; mismatched writes return `409` with the server object.

## 1. Tech stack
| Concern | Choice |
|---|---|
| Language/framework | NestJS (Node 20, TypeScript), modular (one module per domain) |
| DB | PostgreSQL 15 + migrations (TypeORM or Prisma — pick one, document it) |
| Cache/queues | Redis + BullMQ (exports + Field Control integration queue) |
| Realtime | WebSocket gateway (Socket.IO), polling fallback |
| Storage | S3-compatible (attachments) + antivirus scan + thumbnails |
| Auth | JWT access/refresh, optional TOTP 2FA, lockout after N failed attempts |
| Infra (MVP) | Railway/Render → AWS later (S3, managed Postgres, Redis) |

## 2. Modules (map 1:1 to NestJS modules)
`auth`, `orgs`, `members` (RBAC), `workers` (roster), `clients`, `boards`, `lists`, `cards`, `labels`, `comments`, `attachments`, `audit`, `exports`, `integration` (Field Control), `realtime` (WS gateway), `notifications`.

## 3. Build order & Definition of Done

### B1 — Foundation
Repo, CI, PostgreSQL + migrations for the full model (`contracts/data-model.md`), `auth` (email/password, 2FA-ready, sessions, lockout), `members`/RBAC, multi-tenancy, **audit core** (global interceptor), seeds (labels, demo org).
**DoD:** auth + permission tests green; every mutation produces an audit event.

### B2 — Boards / Lists / Cards (MVP)
Full CRUD for boards (day), lists (worker column + pool), cards (scheduled service) with all fields; card move (`/cards/{id}/move`) and state transitions (`contracts/service-state-machine.md`); labels, checklist, comments, attachments (S3 + AV + thumbnails); search & filters; **roster→board auto-generation** (new board creates one list per active worker); **month archiving** (boards of past months become `status=closed` and group by month).
**DoD:** `openapi.yaml` 100% implemented; integration tests green; contract tests pass.

### B3 — Realtime & concurrency
WebSocket events (`contracts/events.md`), optimistic concurrency with `version`, presence, conflict resolution (409 + diff).
**DoD:** concurrent-edit test passes; drag-and-drop broadcasts `card.moved`.

### B4 — Governance
Export center (CSV/XLSX/PDF/JSON, async via BullMQ, all audited), saved views, in-app + email notifications, retention, soft delete.
**DoD:** export jobs run async and are audited; audit trail queryable with filters.

### B5 — Field Control integration
Separate integration service, queue + retries + DLQ + idempotency keys, mappings, sync log, manual reprocess, reconciliation. The portal must work without the integration.
**DoD:** failure/retry/DLQ tested; manual reprocess moves an event back to `done`.

### B6 — NetSuite (future)
Accounting dimensions, billing status, invoices.

## 4. RBAC enforcement
Access levels stored per worker/member: `admin` | `editor` | `none` (see `contracts/permissions-matrix.md`).
- **admin** — full: create/edit/**delete** cards, workers, boards; manage members.
- **editor** — create/edit/**correct** cards; **cannot delete**.
- **none** — read-only (default for new/imported workers).
Enforce on the server (route guards + region scope). The UI mirrors this only to hide/disable controls — never as the sole barrier. Every denial → `403` + audit entry.

## 5. Change control
1. Any agent proposing a contract change writes: what, why, impact on the other side.
2. Human approves/rejects.
3. Contract version bumps; both sides regenerate types/mocks/tests.
4. Logged in the Decision Log.
