# Setup — Delta Schedule Portal

React + Vite + Supabase. The app runs in **demo mode** with mock data out of the box,
and switches to **real mode** automatically when a `.env` is present.

## Demo mode (no backend)
```
npm install
npm run dev            # http://localhost:5173
```
Everything works on rich in-memory mock data (a month of boards, ~200-person roster,
realistic cards). Nothing is persisted.

## Real mode (Supabase)

Backend lives in schema `schedule_portal` of the **shared** project
`sryywirmhohrdsssujwf`. All objects are namespaced there and never touch `public`.

### 1. Database — run the SQL in order (SQL Editor)
```
supabase/migrations/0001_schema.sql        schema, enums, 16 tables, seed labels
supabase/migrations/0002_rls.sql           grants, helpers, provision_me(), RLS
supabase/migrations/0003_storage.sql       bucket schedule-attachments + policies
supabase/migrations/0004_transitions.sql   card_transition() + card_move() RPCs
supabase/migrations/0005_review_fixes.sql  audit hardening + done-flag fix
supabase/migrations/0006_realtime.sql      realtime publication + replica identity
supabase/migrations/0007_rbac.sql          finer RBAC: role gates + region scoping
supabase/migrations/0008_exports.sql       async export worker: bucket + request_export()
supabase/seed_workers.sql                  starter roster (employees + companies) — run once
```

### 2. Expose the schema
Dashboard → **Settings → API → Exposed schemas** → add `schedule_portal`, Save.
(Without this, PostgREST returns `PGRST106 Invalid schema`.)

### 3. First admin
No signup trigger (shared project). Seed a membership, then it is claimed on first login
by `provision_me()`:
```sql
insert into schedule_portal.memberships
  (organization_id, invited_email, role, region, access, status)
select o.id, 'eder@deltaproclean.com', 'admin', 'all', 'admin', 'invited'
from schedule_portal.organizations o
where o.slug = 'delta-pro-clean'
  and not exists (select 1 from schedule_portal.memberships m
                  where lower(m.invited_email) = 'eder@deltaproclean.com');
```
Then create the auth user with a password: **Authentication → Users → Add user**
(same email, mark confirmed). Login is email/password.

### 4. Configure the app
```
cp .env.example .env
```
Set `VITE_SUPABASE_ANON_KEY` to the project's **publishable key** (`sb_publishable_…`,
Dashboard → **Settings → API Keys**). The legacy `anon` JWT is disabled on this project
and will 401 — use the publishable key. `VITE_SUPABASE_URL` is pre-filled. Then:
```
npm run dev
```
Sign in with the seeded email/password. `provision_me()` activates your admin
membership and the board loads with real data.

## Notes
- `.env` is git-ignored — keys stay local.
- Creating a board auto-generates one column per active employee in `schedule_portal.workers`
  (seed them in step 1 or manage them in the app's **Employees** screen).
- Reference-only screens fall back to mock where a Supabase endpoint isn't wired yet.

## Deployment
See **[DEPLOY.md](DEPLOY.md)** for hosting the front-end on Vercel and deploying the
async export worker (Edge Function `export-worker`).

## Status
- ✅ Built & verified: auth, provisioning, board read/create (RLS), transitions,
  drag-drop, roster auto-generation, realtime, attachments, finer RBAC. Screens:
  Login, Boards, Kanban, Card, Table (inline edit + saved views), Dashboard,
  Calendar, Employees, Members, Exports (CSV/JSON client-side), Integration, Audit.
- ⏳ Next: deploy the export worker (XLSX/PDF + large/scheduled async exports);
  Field Control / NetSuite integrations (need credentials).
