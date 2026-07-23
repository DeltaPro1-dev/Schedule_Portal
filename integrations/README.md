# Schedule Portal — Portal Integrations

Scrapers/importers that pull daily schedules from client portals (which have no API)
and land them in `schedule_portal.imported_schedules`. One adapter per **platform**
(SupplyPro/Hyphen covers several builders). Playwright drives a real browser with
**Delta's own credentials**.

## Setup
```
cd integrations
npm install
npx playwright install chromium   # one-time browser download
cp .env.example .env              # fill SUPABASE_SECRET_KEY + SUPPLYPRO_USER/PASS
```
Apply the staging migration first: `supabase/migrations/0006_integration_staging.sql`.

## Run (SupplyPro)
```
# calibration / first run — watch the browser and capture the page:
npm run scrape:supplypro -- --headful --persist

# unattended daily run (after it's calibrated):
npm run scrape:supplypro
```
- `--headful` shows the browser (needed the first time / if MFA appears).
- `--persist` saves the login session to `auth/supplypro.json` and reuses it, so you
  only log in (and clear any MFA/CAPTCHA) once.

Every run writes artifacts to `debug/<adapter>-<timestamp>/`:
`orders.html`, `orders.png`, `parsed.json`. **These are the calibration inputs.**

## Calibration workflow (important)
Selectors/parsing are a first pass built from exported PDFs, not the live DOM. First run:
1. Run with `--headful --persist`.
2. Check `debug/.../parsed.json` — did it extract the orders correctly?
3. If not, send `orders.html` (+ screenshot) back so the login selectors / row parsing
   can be finalized. Override selectors via `SUPPLYPRO_SEL_*` in `.env` if needed.

## Scheduling (daily)
Once calibrated, schedule the unattended command:
- **Windows Task Scheduler** (simplest on your machine): daily action `npm run scrape:supplypro` in this folder.
- or a small VPS / GitHub Actions cron.

## Security
- `.env`, `auth/`, and `debug/` are git-ignored — credentials, sessions and scraped
  data never get committed.
- `SUPABASE_SECRET_KEY` bypasses RLS (backend importer) — keep it private; never ship
  it to the front-end.

## Data flow
```
adapter (login → scrape) → normalize → imported_schedules (upsert, idempotent per source+external_id)
                                             → [next step] map into boards/cards
```
Adding a builder on the same platform = reuse the adapter. A new platform = a new file
in `adapters/` exporting `{ meta, login, scrape }` and a line in `run.js`.
