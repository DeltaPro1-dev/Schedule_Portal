-- ============================================================================
-- Schedule_Portal — Cities → region lookup (G1.10)
-- A small reference table mapping a city name to its region. Feeds the agenda
-- import: a client-portal row's city routes the card to the North/South/St George
-- staging column. "Out Of State" maps to the existing region enum value `another`.
--
-- Domain extension (approved in chat, logged in DECISIONS.md). Run once in the SQL
-- Editor. (0008 = audit triggers, on the feat/audit-all-events branch.)
-- ============================================================================

create table if not exists schedule_portal.cities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  name text not null,
  region schedule_portal.region not null default 'st_george',
  created_at timestamptz not null default now()
);
create unique index if not exists cities_org_name_uidx on schedule_portal.cities(organization_id, lower(name));
create index if not exists cities_org_idx on schedule_portal.cities(organization_id);

-- Grants (RLS still gates rows).
grant select, insert, update, delete on schedule_portal.cities to authenticated;
grant all on schedule_portal.cities to service_role;

-- RLS: same org-scoped pattern as the other domain tables
-- (read = any active member, write = editor+, delete = admin).
alter table schedule_portal.cities enable row level security;

create policy cities_read on schedule_portal.cities
  for select to authenticated using (organization_id = schedule_portal.my_org());

create policy cities_insert on schedule_portal.cities
  for insert to authenticated
  with check (organization_id = schedule_portal.my_org() and schedule_portal.can_edit());

create policy cities_update on schedule_portal.cities
  for update to authenticated
  using (organization_id = schedule_portal.my_org() and schedule_portal.can_edit())
  with check (organization_id = schedule_portal.my_org() and schedule_portal.can_edit());

create policy cities_delete on schedule_portal.cities
  for delete to authenticated
  using (organization_id = schedule_portal.my_org() and schedule_portal.is_admin());
