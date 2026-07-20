# Deploy — Delta Schedule Portal

Two parts: the **front-end** (Vercel) and the **async export worker** (Supabase Edge
Function). Both require account access that the build agent does not have, so these are
the manual steps for an operator with the Delta Vercel + Supabase accounts.

---

## 1. Front-end → Vercel (host decided: D7)

Config lives in [`vercel.json`](vercel.json) (framework `vite`, build `npm run build`,
output `dist`, SPA rewrite to `/index.html`).

1. **Import the repo** in Vercel → *New Project* → pick `DeltaPro1-dev/Schedule_Portal`
   → branch to deploy (e.g. `main` after merge). Vercel auto-detects Vite.
2. **Environment variables** (Project → Settings → Environment Variables) — do **not**
   commit these; they live only in Vercel:
   - `VITE_SUPABASE_URL` — the shared project URL (see `.env.example`).
   - `VITE_SUPABASE_ANON_KEY` — the **publishable** key `sb_publishable_…`
     (the legacy `anon` JWT is disabled on this project and will 401).
3. **Deploy.** Every push to the chosen branch builds and deploys; PRs get preview URLs.
4. Without these env vars the app still builds and runs in **demo mode** (mock data),
   which is a safe preview default.

> Netlify/Cloudflare Pages work too (same build/output + SPA fallback), but Vercel is
> the chosen host.

---

## 2. Async export worker → Supabase Edge Function

The Export Center already does **CSV/JSON client-side** (instant, logged to the
`exports` table). The worker adds **large / scheduled** exports and is where **XLSX/PDF**
will be generated. Code: [`supabase/functions/export-worker/index.ts`](supabase/functions/export-worker/index.ts).

### 2.1 Apply the migration
Run [`supabase/migrations/0008_exports.sql`](supabase/migrations/0008_exports.sql) in the
SQL Editor. It creates the private `schedule-exports` bucket, member read access to
their own org's files, and `schedule_portal.request_export(report_type, format, params)`
(enqueues a row with `status='queued'`).

### 2.2 Deploy the function
```
supabase functions deploy export-worker --project-ref sryywirmhohrdsssujwf
```
The function reads its config from the platform-provided env (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) — the service-role key bypasses RLS to write files and
update rows. Do not expose it to the client.

### 2.3 Schedule it
Invoke on a schedule so queued jobs drain automatically. Either:
- **pg_cron** (Dashboard → Database → Cron) calling the function URL every minute, or
- a **Supabase scheduled function**.

Each run processes up to 10 queued rows: builds the file, uploads to
`schedule-exports/<org_id>/<export_id>.<ext>`, and sets the row `done` (or `failed`).

### 2.4 Wire the UI (follow-up)
Today CSV/JSON are client-side and XLSX/PDF are disabled in the Export Center. Once the
worker is deployed, switch XLSX/PDF (and any "large export" action) to call
`api.requestExport()` → `request_export` RPC, and offer a signed-URL download from the
`schedule-exports` bucket when the row reaches `done`. Tracked in DECISIONS.md (G2.1).

**Not supported yet:** XLSX and PDF generation need a formatter library in the worker;
until then those jobs are marked `failed`. CSV and JSON are fully supported.

---

## Rollback / safety
- Front-end: Vercel keeps every deployment — roll back from the dashboard.
- Worker: it only reads cards and writes to the isolated `schedule-exports` bucket +
  the `exports` table; it never mutates operational data.
- All objects stay in schema `schedule_portal` / the `schedule-exports` bucket and never
  touch `public.*` or other apps in the shared project.
