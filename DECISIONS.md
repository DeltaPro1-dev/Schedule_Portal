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

## Planning consolidation (2026-07-20)
`PLANO_MESTRE.md` added: reconciles the master-planning prompt with the built
system (G0 → G1.6), maps its 30 sections to Done/Partial/Pending, and lays out the
completion roadmap (G2 → G8) plus the approval gate. No code, planning artifact.

---

## G3.1 — Table view + Dashboard (2026-07-20)
**Approved by:** Eder (owner), "continue a execução" (express go on the plan gate).
First execution items of roadmap **G3 (operational views)** — the top self-contained
screens that need none of the pending decisions (D6 `worker_id`, D7 host, D8
integrations). Front-end only; no schema/API surface change.

- **Table view** (`src/components/TableView.jsx`, §9.2): spreadsheet of one board's
  cards. Sortable columns (Worker/Status/Client/Building/Service/Scheduled/Done),
  text + status filter, row → card modal, client-side **CSV export** of the filtered
  rows. Reuses `api.getBoardDetail` + realtime `subscribeBoard`, so it works in mock
  and real mode identically. Reached via a **Board / Table** segmented toggle
  (`ViewToggle`, exported from TableView and reused in `Board.jsx`).
- **Dashboard** (`src/components/Dashboard.jsx`, §9.7): current-month operational
  overview — KPI tiles (jobs, completed, completion %, in-progress, rework,
  ready-to-invoice, integration errors), jobs-by-status bar, jobs-by-region and
  top-clients bars. Aggregates from existing `getBoards` + `getBoardDetail`
  (capped to the 12 most recent boards of the month, scope shown in the header) +
  `getIntegration`. Added to `TopNav` and `App` SECTIONS.
- **CSV helper** (`src/lib/csv.js`): RFC-4180-ish quoting + browser download. Serves
  the §13 "small export" path; large/scheduled exports still go to the async export
  worker (roadmap G2).

**Honest gaps (NOT faked):** hours planned-vs-actual is not a tracked card field yet
(roadmap G5) — the dashboard states this and omits the metric rather than inventing
it. "Overdue" is likewise not shown (cards carry `scheduled_time` as free text, not a
comparable timestamp).

Verified: `npm run build` green; headless (Playwright) smoke — login → Dashboard
renders & aggregates, board → Table renders 24 jobs with sort + CSV, Board↔Table
toggle both ways, zero page errors.

---

## D7 — Front-end host = Vercel (2026-07-20)
**Approved by:** Eder (owner), in chat. Pending decision D7 from `PLANO_MESTRE.md`
resolved. Vercel chosen for the Vite/React SPA (simplest deploy, per-PR previews).
- `vercel.json` added: framework `vite`, build `npm run build`, output `dist`, SPA
  rewrite to `/index.html` (excluding `/assets/*` and files with an extension).
- Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are set in the
  Vercel project settings, not committed (see `.env.example`). No `.env` → demo mode.
Unblocks the deploy step of roadmap G2.

---

## G3.2 — Calendar view (2026-07-20)
**Approved by:** Eder (owner), chose "Calendar view" as the next G3 item.
Second execution item of roadmap **G3**. Front-end only; no schema/API change.

- `src/components/Calendar.jsx` (§9.3): month + week grid over the day-boards
  (Board = one operating day). Each populated cell opens that board; cells show
  workers count, open/closed, starred. Month/week toggle + prev/next navigation.
  Uses `api.getBoards` only (no per-day detail fetch — cheap in real mode); works
  in mock and real mode. Added to `TopNav` + `App` SECTIONS; `App` now passes
  `onOpenBoard` to section screens.

**Honest scope:** cards carry `scheduled_time` as free text (not a comparable
timestamp), so a true per-event/per-hour calendar isn't meaningful yet — the view
is a board-per-day navigator, not an hour grid. Team/service filters on the calendar
are deferred (board list doesn't carry that without loading each day's detail).

Verified: build green; headless smoke — Calendar renders month (July) with open/
closed cells, week toggle shows the week range, prev/next navigates, clicking an
open day opens that board. Zero page errors.

---

## G3.3 — Responsiveness + accessibility pass (2026-07-20)
**Approved by:** Eder (owner), "continue com responsividade e acessibilidade".
Closes the **G3 gate** item (WCAG/keyboard/ARIA + mobile/tablet). Front-end only;
no schema/API change.

**Accessibility (`src/index.css` + components):**
- Global: `:focus-visible` ring for keyboard users (white variant `.on-navy` on dark
  surfaces), `.sr-only` utility, `prefers-reduced-motion` disables transitions/lift.
- **CardModal → dialog**: `role="dialog"`, `aria-modal`, `aria-labelledby` the title;
  **Escape closes**; focus moves into the dialog on open and is **restored to the
  trigger** on close; close button `aria-label`. Done + checklist checkboxes are now
  real `<button role="checkbox" aria-checked>` (keyboard operable) instead of
  `<span onClick>`. Comment/checklist inputs get `aria-label`.
- **Keyboard drag-and-drop alternative**: CardModal gains a labelled **"Move to"**
  `<select>` of the board's lists (App now passes `lists` to the modal) →
  `api.moveCard`. Cards can be re-assigned without a mouse, closing the DnD a11y gap
  noted in `PLANO_MESTRE.md` §C.
- **Board**: card tiles are `role="button"` + `tabIndex=0` + Enter/Space to open,
  with descriptive `aria-label`; done checkbox → accessible button; add-card /
  add-worker are `<button>`s; search + profile inputs labelled; decorative
  glyphs/avatars `aria-hidden`.
- **TableView**: sortable headers are `<th scope="col" aria-sort>` wrapping a
  `<button>`; rows are keyboard-openable (Enter); search/status inputs labelled;
  ViewToggle uses `aria-pressed` in a labelled `role="group"`.
- **Calendar**: nav arrows `aria-label` (Previous/Next), month label `aria-live`,
  mode toggle `aria-pressed`, day-cell buttons carry a descriptive `aria-label`.
- **TopNav**: `<nav aria-label>` + `aria-current="page"` on the active item.

**Responsiveness (`src/index.css` breakpoints + classNames):**
- ≤860px: Login brand panel hidden (`.login-brand`), form takes the screen.
- ≤760px: TopNav / section / board / table headers wrap and reduce horizontal
  padding; control clusters grow to full width (`.resp-header`, `.resp-grow`,
  `.topnav`, `.board-head`, `.board-main`, `.section-scroll`).
- ≤520px: CardModal collapses from two columns to one (`.card-modal-grid`).
- The board keeps horizontal scroll (columns) — the intended mobile pattern.

Verified: build + lint green; headless (Playwright) — keyboard-focus a card tile →
Enter opens the dialog (`aria-modal=true`), Escape closes it, the "Move to" control
is present; at 375px the brand panel is hidden and there is **no horizontal page
overflow**. Zero page errors.

**Remaining G3 item:** inline editing in the Table + saved views (`SavedView`) +
global search. After that, G3 gate is fully clear.

---

## G3.4 — Table inline editing + saved views (2026-07-20) — G3 gate clear
**Approved by:** Eder (owner), "continue com a edição inline e saved views".
Last **G3** item. Front-end + one additive API method; **no schema change**.

- **`api.updateCard(cardId, patch)`** (mock + real): patches free-text card fields.
  Real mode updates `cards` directly (RLS/region guards decide if the caller may
  edit) and bumps `updated_at`; returns the mapped card. Status changes still go
  through `card_transition` (the FSM) — not editable inline by design; client is a
  relation (also modal-only).
- **Inline editing in the Table** (`TableView.jsx`): Building, Service and Scheduled
  cells are editable in place — click (or keyboard-focus) → input → Enter/blur saves
  via `updateCard`, Escape cancels. Editable cells `stopPropagation` so they never
  open the card modal; the other cells (Worker/Status/Client) and row-Enter still
  open it. Done is an inline accessible toggle (`button[role=checkbox]`) →
  `toggleDone`. Read-only when `canEdit` is false (App passes `canEdit` from the
  membership, same rule as the modal).
- **Saved views** (`src/lib/savedViews.js`, localStorage): save the current
  {query, status, sort} as a named view; chips apply / delete them. **MVP scope:
  per-browser, no schema change.** Shared/cross-device views (the `SavedView` table
  in data-model.md) remain a future item needing a migration + contract decision
  (Regra de Ouro) — documented, not faked.
- Global search across boards is **not** included here (this is the per-board table
  filter); a cross-board global search stays on the G3 backlog as a nice-to-have.

Verified: build + lint green (only pre-existing mock.js warnings); headless
(Playwright) — 72 editable cells, inline edit persists ("ZZZ-INLINE-TEST" shows
after Enter), Done toggle flips `aria-checked`, a saved view chip is created and
re-applying it restores the search term. Zero page errors.

**G3 (operational views) gate: CLEAR** — Table, Dashboard, Calendar,
responsiveness + accessibility, inline editing + saved views all delivered. Open
backlog (non-blocking): cross-board global search; shared SavedView table.

---

## G2.1 — Export worker + deploy prep (2026-07-20)
**Approved by:** Eder (owner), "continue com o export worker + deploy (G2)".
Two-layer export strategy so exports work **today** while the async worker is
prepared for deployment. The build environment has no Supabase/Vercel account
access, so server/infra pieces are shipped **ready-to-deploy and are explicitly
NOT yet deployed** (honest boundary; steps in DEPLOY.md).

**Working now (client-side, tested):**
- `src/lib/exporters.js`: builds real **CSV** (daily schedule, newest board) and
  **JSON** (full backup, current month capped at 12 boards) from live data and
  downloads them. `src/lib/csv.js` reused.
- `Exports.jsx`: CSV/JSON format cards are actionable → generate + download +
  success/row-count feedback; **XLSX/PDF are disabled** with "via worker (deploy
  pending)". "Recent exports" refreshes after each run.
- `api.logExport(...)`: records a completed export. Real mode inserts an `exports`
  row via the **existing `exports_insert` RLS policy** (no migration needed);
  best-effort (a logging failure never fails the download). Mock keeps a mutable
  jobs list so the audit/history updates live in demo.

**Ready to deploy (NOT deployed — no account access):**
- `supabase/migrations/0008_exports.sql`: private `schedule-exports` bucket + member
  read policy (own-org folder) + `request_export(report_type, format, params)` RPC
  (enqueue, status `queued`).
- `supabase/functions/export-worker/index.ts`: Deno Edge Function that drains queued
  `exports` rows → builds CSV/JSON → uploads to `schedule-exports/<org>/<id>.<ext>` →
  marks `done`. XLSX/PDF marked `failed` until a formatter lib is added.
- `DEPLOY.md`: Vercel front-end steps (env vars, SPA config) + worker deploy
  (migration, `functions deploy`, schedule) + UI follow-up.

**Deferred (documented):** XLSX/PDF generation (needs a worker-side library);
switching XLSX/PDF/large exports in the UI to `request_export` + signed-URL download
once the worker is live; actually running `vercel` / `supabase functions deploy`
(needs the Delta accounts).

Verified: build + lint green; headless (Playwright) — CSV downloads
`daily-schedule-…​.csv` (header + 24 rows, commas quoted), JSON downloads
`full-backup-2026-07.json`, XLSX/PDF disabled, "Recent exports" gains a "You" row.
Zero page errors. Migration + Edge Function reviewed against the schema (enums
`export_format`/`export_status`, columns, existing RLS) but not executed.
