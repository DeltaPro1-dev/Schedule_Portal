# Setup — Schedule_Portal (Supabase-native, G1)

The app is React + Vite + Supabase, living in the `schedule_portal` schema of the
**shared** project `sryywirmhohrdsssujwf` ("support@deltaproclean.com's Project").
See `DECISIONS.md` (G1) for why, and `data-model.md` for the domain.

## 1. Database

Apply the migrations **in order** in the project's SQL Editor (or via Supabase CLI):

```
supabase/migrations/0001_schema.sql       -- schema, enums, 16 tables, seed labels
supabase/migrations/0002_rls.sql          -- grants, helpers, provision_me(), RLS
supabase/migrations/0003_storage.sql      -- bucket schedule-attachments + policies
supabase/migrations/0004_transitions.sql  -- card_transition() + card_move() RPCs
```

They are namespaced under `schedule_portal.*` and touch nothing the Check List
App / Expense Portal / sheets-sync own in `public`.

## 2. Expose the schema to the API

Supabase Dashboard → **Settings → API → Exposed schemas** → add `schedule_portal`.
Without this, PostgREST (and `supabase-js`) can't see the tables.

## 3. Invite the first admin

There is no signup trigger (shared project). Seed a membership, then log in with
that email — `provision_me()` claims it on first login:

```sql
insert into schedule_portal.memberships (organization_id, invited_email, role, region, access, status)
select id, 'eder@deltaproclean.com', 'admin', 'all', 'admin', 'invited'
from schedule_portal.organizations where slug = 'delta-pro-clean';
```

## 4. Run the app

```
cp .env.example .env      # fill VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Sign in with the invited email (magic link). You should land on the authorized
shell showing your role/region/access.

## What's built vs. pending

- ✅ DB schema, RLS, provisioning, state-machine + move RPCs, storage bucket.
- ✅ App shell: auth (magic link), provisioning, authorized landing.
- ⏳ **Next:** the Trello board UI (day boards, worker columns, service cards,
  drag-and-drop, labels, checklist, comments, attachments) + Realtime.
