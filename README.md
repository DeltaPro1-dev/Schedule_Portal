# Delta Schedule Portal

Trello-style daily operations portal for Delta Pro Clean — daily scheduling, team
allocation and work orders on a board, with a full audit trail.

**Product model**
- **Board = one operating day** (e.g. `JUL/16/26 · THURSDAY`). Past months are archived.
- **List (column) = one worker/vendor.** The first list, *DELTA OFFICE / WAREHOUSE*,
  is the resource pool (companies/contractors).
- **Card = one scheduled service** for that worker on that day (structured briefing,
  labels, checklist, comments, attachments).
- **Regions:** North, South, St George, Another State.
- Creating a board **auto-generates one column per active employee** from the roster.

## Stack (Supabase-native — G1)

React + Vite + Supabase. This replaced the frozen G0 contract stack (NestJS + Redis +
S3) to cut cost and match Delta's other apps — see [DECISIONS.md](DECISIONS.md).

| Concern | Implementation |
|---|---|
| UI | React 19 + Vite + Tailwind v4 (design tokens from the Claude Design handoff) |
| Data / API | Supabase Postgres, schema `schedule_portal`, via PostgREST + RPCs |
| Auth | Supabase Auth (email/password); provisioning via `provision_me()` RPC |
| Realtime | Supabase Realtime (planned) |
| Storage | Supabase Storage bucket `schedule-attachments` |

The schema lives inside the **shared** project `sryywirmhohrdsssujwf` (also hosts the
Check List App, Expense Portal and sheets-sync), fully namespaced under
`schedule_portal.*` — it never touches `public`.

## Run it

**Demo mode (no backend):** with no `.env`, the app runs on rich in-memory mock data.
```
npm install
npm run dev
```

**Real mode (Supabase):** add a `.env` (see [SETUP.md](SETUP.md)) and it switches
automatically. Full setup steps — keys, schema exposure, migrations, seeds — are in
[SETUP.md](SETUP.md).

## Project structure

```
src/
  App.jsx                 routing (login → gallery → board → sections) + modal
  components/             Login, Gallery, Board, CardModal, TopNav, SectionHeader,
                          Roster, Members, Exports, Integration, Audit
  lib/
    api.js                data API — switches mock ↔ Supabase by env
    mock.js               deterministic in-memory demo backend
    supabase.js           client (schema: schedule_portal)
    stateMachine.js       card status transitions (mirrors the RPC)
    present.js, title.js  presentation helpers
supabase/
  migrations/             0001 schema · 0002 rls · 0003 storage · 0004 transitions · 0005 review-fixes
  seed_workers.sql        starter roster (run once)
Portal Schedule/          Claude Design handoff (prototype + frozen contracts) — reference
```

## Domain contract (G0, still authoritative for the model)

The domain — entities, RBAC, state machine, naming — is frozen at Gate G0. The
transport pivoted to Supabase (G1), so `openapi.yaml` documents the intended API
surface for reference; the live API is PostgREST + the RPCs in migration 0004.

| File | Content |
|---|---|
| [glossary.md](glossary.md) | Canonical names (Board, List, Card, Region, Label…) |
| [data-model.md](data-model.md) | Entities, fields, relationships |
| [permissions-matrix.md](permissions-matrix.md) | Role × module RBAC |
| [service-state-machine.md](service-state-machine.md) | Card lifecycle |
| [events.md](events.md) | WebSocket / notification / audit events |
| [openapi.yaml](openapi.yaml) | G0 API contract (reference) |

## Governance (regra de ouro)

Nothing is implemented outside the contract. Contract changes are proposed, approved by
a human, versioned, and logged in [DECISIONS.md](DECISIONS.md).
