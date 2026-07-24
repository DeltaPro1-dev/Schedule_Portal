# Delta Schedule Portal

Trello-style daily operations portal for Delta Pro Clean — daily scheduling, team
allocation and work orders on a board, with a full audit trail. **Live in production**
on Vercel (team *Delta Pro Clean*), backed by Supabase.

**Product model**
- **Board = one operating day** (e.g. `JUL/16/26 · THURSDAY`). Past months are archived.
- **List (column) = one worker/vendor.** The first list, *DELTA OFFICE / WAREHOUSE*,
  is the resource pool (companies/contractors).
- **Card = one scheduled service** for that worker on that day (structured briefing,
  labels, checklist, comments, attachments). Cards can be **duplicated** when 2+ workers
  go to the same job.
- **Regions:** North, South, St George, Another State.
- Creating a board **auto-generates one column per active employee** from the roster.

## Stack (Supabase-native)

React + Vite + Supabase. This replaced the frozen G0 contract stack (NestJS + Redis +
S3) to cut cost and match Delta's other apps — see [DECISIONS.md](DECISIONS.md).

| Concern | Implementation |
|---|---|
| UI | React 19 + Vite + Tailwind v4; responsive (phone portrait + landscape), accessible (ARIA/keyboard) |
| Data / API | Supabase Postgres, schema `schedule_portal`, via PostgREST + RPCs |
| Auth | Supabase Auth (email/password); provisioning via `provision_me()` RPC |
| Realtime | Supabase Realtime (board reflects other clients' changes live) |
| Storage | Supabase Storage bucket `schedule-attachments` (attachments) + `schedule-exports` (worker) |
| Hosting | Front-end on **Vercel** (auto-deploy from `main`); see [DEPLOY.md](DEPLOY.md) |

The schema lives inside the **shared** project `sryywirmhohrdsssujwf` (also hosts the
Check List App, Expense Portal and sheets-sync), fully namespaced under
`schedule_portal.*` — it never touches `public`.

## Features (all 16 priority screens)

- **Boards gallery** — boards grouped by month, archived months collapsible.
- **Kanban board** — worker columns + vendor pool, drag-and-drop, realtime, inline add,
  quick card create, status machine, per-day tabs.
- **Card detail** — structured briefing, labels, checklist, attachments (signed URLs),
  comments, status transitions, **duplicate**, keyboard **"Move to"** worker.
- **Table view** — spreadsheet per board: sortable, filter, inline edit, saved views,
  client-side CSV export.
- **Dashboard** — this-month KPIs (jobs, completed, rework, integration errors), by
  status / region / top clients.
- **Calendar** — month/week over the day-boards.
- **Employees, Teams, Customers (+ Locations), Members & RBAC** — CRUD + search.
- **Exports** — CSV/JSON download now (client-side); XLSX/PDF via the async worker.
- **Audit** — immutable log with before→after diff, filters, search, CSV.
- **Integration Monitor** — Field Control queue with retries/DLQ + manual reprocess.
- **Settings** — session, org, in-app notification preferences, label catalog, governance.
- **Notifications** — in-app bell (assignment / status / export / integration…).

## Run it

**Demo mode (no backend):** with no `.env`, the app runs on rich in-memory mock data.
```
npm install
npm run dev
```

**Real mode (Supabase):** add a `.env` (see [SETUP.md](SETUP.md)) and it switches
automatically. Full setup — keys, schema exposure, migrations, seeds — is in
[SETUP.md](SETUP.md). Deployment (Vercel + export worker) is in [DEPLOY.md](DEPLOY.md).

## Project structure

```
src/
  App.jsx                 routing (login → gallery → board → sections) + card modal
  components/             Login, Gallery, Board, CardModal, TopNav, SectionHeader,
                          Dashboard, Calendar, TableView, Roster (Employees), Teams,
                          Customers, Members, Exports, Integration, Audit, Settings,
                          NotificationBell
  lib/
    api.js                data API — switches mock ↔ Supabase by env
    mock.js               deterministic in-memory demo backend
    supabase.js           client (schema: schedule_portal)
    stateMachine.js       card status transitions (mirrors the RPC)
    exporters.js, csv.js  client-side CSV/JSON export
    savedViews.js, prefs.js  localStorage (table views, notification prefs)
    present.js, title.js  presentation helpers
supabase/
  migrations/             0001 schema · 0002 rls · 0003 storage · 0004 transitions ·
                          0005 review-fixes · 0006 realtime · 0007 rbac · 0008 exports ·
                          0009 notifications+audit · 0010 worker_link (D6) · 0011 teams ·
                          0012 reprocess
  functions/export-worker Edge Function for async XLSX/PDF/large exports (deploy separately)
  seed_workers.sql        starter roster (run once)
Portal Schedule/          Claude Design handoff (prototype + frozen contracts) — reference
```

## Domain contract (G0, still authoritative for the model)

The domain — entities, RBAC, state machine, naming — is frozen at Gate G0. The
transport pivoted to Supabase (G1), so `openapi.yaml` documents the intended API
surface for reference; the live API is PostgREST + the RPCs in migrations 0004/0007/
0010/0012 (`card_transition`, `card_move`, `request_export`, `reprocess_integration`, …).

| File | Content |
|---|---|
| [glossary.md](glossary.md) | Canonical names (Board, List, Card, Region, Label…) |
| [data-model.md](data-model.md) | Entities, fields, relationships |
| [permissions-matrix.md](permissions-matrix.md) | Role × module RBAC |
| [service-state-machine.md](service-state-machine.md) | Card lifecycle |
| [events.md](events.md) | WebSocket / notification / audit events |
| [openapi.yaml](openapi.yaml) | G0 API contract (reference) |

## Status

Live in production (16/16 screens), connected to Supabase with the real roster
(~200 workers) and customer list (~440). Migrations 0001–0012 applied. Open, optional
follow-ups (see DECISIONS.md): deploy the `export-worker` (XLSX/PDF), set worker
regions, invite supervisor/coordinator logins, and the Field Control / NetSuite
integrations (decision D8).

## Governance (regra de ouro)

Nothing is implemented outside the contract. Contract changes are proposed, approved by
a human, versioned, and logged in [DECISIONS.md](DECISIONS.md).
