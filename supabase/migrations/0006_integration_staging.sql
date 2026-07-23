-- ============================================================================
-- Schedule_Portal — staging table for scraped/imported schedules.
-- Portal adapters (integrations/) upsert here; a later step maps rows into
-- boards/cards. Idempotent per (source, external_id) so daily re-runs dedupe.
-- ============================================================================
create table if not exists schedule_portal.imported_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  source text not null,                 -- 'supplypro' | 'buildertrend' | 'arive' | ...
  external_id text not null,            -- stable id from the source (order/PO/code)
  builder text,
  community text,
  lot text,
  address text,
  activity text,                        -- raw activity text from the portal
  service_type text,                    -- normalized (Final Clean, Power Wash, …)
  status text,
  scheduled_date date,
  po_number text,
  raw jsonb,                            -- full raw row for re-parsing/audit
  imported_at timestamptz not null default now(),
  mapped_card_id uuid references schedule_portal.cards(id) on delete set null,
  unique (source, external_id)
);
create index if not exists imported_org_source_date_idx
  on schedule_portal.imported_schedules(organization_id, source, scheduled_date);

grant select, insert, update, delete on schedule_portal.imported_schedules to authenticated;
grant all on schedule_portal.imported_schedules to service_role;

-- Members read imports for their org; writes come from the importer (service_role,
-- which bypasses RLS).
alter table schedule_portal.imported_schedules enable row level security;
create policy imported_read on schedule_portal.imported_schedules
  for select to authenticated using (organization_id = schedule_portal.my_org());
