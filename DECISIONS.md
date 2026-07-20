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

---

## G1.2 — Realtime enabled (2026-07-18)
**Approved by:** Eder (owner), in chat.
First of the G1.1 "Deferred" items delivered. Realtime now backs the board so a
change by one client is reflected on others without a manual reload.

- `0006_realtime.sql`: adds `cards`, `lists`, `boards` to the `supabase_realtime`
  publication and sets `replica identity full` on `cards`/`lists` (so UPDATE/DELETE
  events carry the full OLD row for row-filtering). RLS still scopes every stream to
  the member's org — no cross-org leakage.
- `api.subscribeBoard(boardId, onChange)`: opens one channel with `postgres_changes`
  listeners on the three tables (filtered to the board); returns an unsubscribe fn.
  Mock mode ships a no-op so the API surface is identical.
- `Board.jsx`: subscribes on mount and reloads `getBoardDetail` (debounced 300ms) on
  any event; unsubscribes on unmount / board switch. Optimistic local updates stay;
  the remote event just triggers a reconciling refetch.

Maps to events.md (card.created/updated/moved/completed, list.created, board.updated)
— we consume the Postgres-change stream rather than re-emitting named socket events.

---

## G1.3 — Admin screens wired to Supabase (2026-07-18)
**Approved by:** Eder (owner), in chat.
Second G1.1 "Deferred" item. In real mode the admin screens now read live
`schedule_portal` data instead of falling through to the mock.

- `realApi.getMembers()` → `memberships` (RLS returns all rows for admins, own row
  otherwise). No `name` column exists (identity is in Supabase Auth), so the display
  name is derived from the invite email's local part; role enum maps to the screen's
  display keys (`viewer` → read).
- `realApi.getAudit()` → `audit_events` (newest 100). Actor names resolved best-effort
  from visible memberships; `system`/unknown actors show "System"/"User". `detail`
  jsonb rendered to a readable phrase.
- `realApi.getExports()` → static format cards + `exports` rows (empty until an export
  worker exists). Status enum `done` → `completed`.
- `realApi.getIntegration()` → `integration_events` + stats computed from the rows.
  Status enum `done` → `synced`; direction push/pull → human labels.
- `getPermMatrix()` stays mock-served on purpose: it is static reference data (the
  permissions-matrix.md RBAC grid), identical in both modes — not per-org state.
- Components hardened for the real enums: `Members` ROLE map gains `admin`/`viewer`
  (+ fallback); `Exports`/`Integration` status maps gain `failed`/fallback so unknown
  statuses never crash.

Tables other than audit are typically empty today, so these screens render valid
empty states in real mode until their producers (export worker, Field Control queue)
are built. Actor/requester name resolution is limited by memberships RLS for
non-admins — acceptable for MVP.

---

## G1.4 — Checklist UI in the card modal (2026-07-18)
**Approved by:** Eder (owner), in chat.
Third G1.1 "Deferred" item. The checklist data path already existed end-to-end
(`checklist_items` table + RLS in 0001/0002, `api.addChecklistItem` /
`api.toggleChecklistItem` in both mock and realApi, and `getBoardDetail` already
embeds `checklist_items(*)`) — only the UI was missing.

- `CardModal.jsx`: renders the card's checklist with a done/total counter and a
  progress bar, per-item toggle checkboxes, and an "Add an item" input (editors+).
  Mutations go through the existing `run()` helper, so they reuse optimistic-refresh
  (onChanged → cardVersion → board/modal refetch) and error surfacing. Read-only for
  `access = none`.

No schema or API change — purely the missing presentation layer.

---

## G1.5 — Attachment upload UI (2026-07-18)
**Approved by:** Eder (owner), in chat.
Fourth G1.1 "Deferred" item. The storage backend already existed (bucket
`schedule-attachments` + read/write/delete policies in 0003, `attachments` table
in 0001) — the API layer and UI were missing.

- `realApi.addAttachment(cardId, file)`: uploads to `<card_id>/<ts>-<name>` in the
  private bucket, then inserts the `attachments` row (filename/mime/size/s3_key,
  uploaded_by = auth uid). Rolls back the storage object if the row insert fails, so
  storage and table never drift.
- `realApi.attachmentUrl(s3_key)`: 1-hour signed URL to open/preview (bucket is
  private). Mock returns an in-memory object URL.
- `getBoardDetail` now embeds `attachments(*)`; `mapCard` exposes `card.attachments`.
- `CardModal`: Attachments section lists files (name + size) that open in a new tab
  via signed URL; editors+ get a file picker ("+ Add"). Uploads reuse `run()`
  refresh + error surfacing. Read-only for `access = none`.

Storage policies (0003) enforce access: any member reads, editors+ upload, admins
delete. Delete-from-UI deferred (admin-only server-side) to keep this pass focused.
No AV/scan pipeline in G1 (that was G0's S3 design), so `scan_status` stays `pending`
and is not surfaced yet.

---

## G1.6 — Finer RBAC: role gates + region scoping (2026-07-18)
**Approved by:** Eder (owner), in chat (source of role/region = real membership;
enforcement layer = RLS + RPCs).
Last G1.1 "Deferred" item. Region/role are now enforced server-side per
permissions-matrix.md and service-state-machine.md, as far as the schema allows.

- `0007_rbac.sql`:
  - `sees_all_regions()` helper (admin/coordinator/finance/viewer, or region=all).
  - RLS on `lists`/`cards` adds region scoping: region-bound members only see/write
    rows whose list's worker is in their region (pool lists visible to all). Delete
    stays admin-only; access-level `can_edit()` still required for writes.
  - `card_transition()` now enforces the full role×transition matrix (admin does
    anything) plus a region guard.
  - `card_move()` gains a region guard on source and target list.
- App uses the **real membership** in real mode: `Board` derives `canEdit` from
  `membership.access` and shows a role/region badge; the "Profile" selector is now
  demo-only (it never reflected real identity). Mock/demo behavior unchanged.
- The client `stateMachine` still lists all structurally-valid transitions; the UI
  shows them and the RPC rejects unauthorized ones (error surfaced in the modal).

**Documented gaps (need a contract + schema decision — Regra de Ouro, NOT implemented
as fake behavior):**
1. No `membership <-> worker` link, so operator "assigned" scope ("only my own list")
   is not expressible. Operators are treated as region-scoped (safe superset).
   Proposed fix: add `memberships.worker_id`.
2. Boards span regions (region lives on the worker behind a list), so region scoping
   applies to lists/cards, not boards. Region-bound users see pool lists but not pool
   cards.

Only member today is admin/region=all (sees & does everything), so 0007 changes
nothing observable for the current user until region-scoped members are invited —
by design, low-risk to apply.

---

## G1.8 — Field Control CSV export (2026-07-19)
**Approved by:** Eder (owner), in chat — CSV must match the Field Control import
template exactly (reference file "Agenda_2026-07-20.xlsx", sheet "Ordens").
(Sibling branch to G1.7/audit; both branch off main.)

Per-board export: a "⬇ CSV" button on the board header downloads
`Agenda_<board.date>.csv`, one row per card (pool list excluded), ordered by column
(list position) then card position.

Exact format (extracted from the template):
- 13 columns, fixed order and PT-BR headers: Identificador, Tipo de OS, Documento do
  cliente, Nome do cliente, Nome da localização, Número de série, Nome do colaborador,
  Nomes dos colaboradores secundarios, Data de agendamento, Hora de agendamento,
  Descrição, Descrição da tarefa, Etiquetas.
- A/C/F/H/J/L are always blank. UTF-8 **with BOM**, comma-separated, CRLF.
- Field mapping: B=service_type, D=client, E=`building - plan|No Plan - lot|No Lot`,
  G=worker (list name), I=board date as **mm/dd/yyyy**, K=`[& **SCHEDULED AT {time}** ]PS: {ps_note}`,
  M=label names alphabetical joined by " ; " with a trailing space.
- `src/lib/fieldControlCsv.js` builds it (pure, unit-checked); `Board.jsx` wires the
  button; `realApi.recordExport()` logs the job (exports row → EXPORT audit via the
  0008 trigger, appears in Export Center). Demo mode just downloads (no record).

Decisions taken: no HOURS field in the portal, so K omits it (schedule marker + PS
only); service_type is assumed to already hold the Field Control "Tipo de OS" value.
Cancelled cards are currently included — revisit if the field shouldn't receive them.
