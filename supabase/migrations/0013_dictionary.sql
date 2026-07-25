-- Schedule_Portal — Dictionary of place references (data-completion)
-- Imported cards often arrive incomplete (missing builder/client, floor plan, etc.).
-- A dictionary entry maps a place identifier (building / subdivision / client /
-- address) to the canonical field values, so incomplete cards from the same place
-- are auto-completed. STATUS: ready to deploy — NOT yet applied. Additive only.

-- 1. Card gains a `subdivision` field (a chosen match key; the card didn't have it).
alter table schedule_portal.cards add column if not exists subdivision text;

-- 2. Dictionary table
create table if not exists schedule_portal.dictionary (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  -- what identifies "the same place"
  match_field text not null check (match_field in ('building','subdivision','client','address')),
  match_value text not null,
  -- canonical values to fill into matching cards (any subset)
  client_text text,
  address text,
  subdivision text,
  plan text,
  lot text,
  service_type text,
  fin_contact text,
  ps_note text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- one reference per (org, field, normalized value)
create unique index if not exists dictionary_key_uidx
  on schedule_portal.dictionary(organization_id, match_field, lower(match_value))
  where deleted_at is null;
create index if not exists dictionary_org_idx on schedule_portal.dictionary(organization_id);

-- 3. RLS — standard org-scoped (select = member, write = editor, delete = admin)
alter table schedule_portal.dictionary enable row level security;
grant select, insert, update, delete on schedule_portal.dictionary to authenticated;

drop policy if exists dictionary_read on schedule_portal.dictionary;
create policy dictionary_read on schedule_portal.dictionary
  for select to authenticated using (organization_id = schedule_portal.my_org());

drop policy if exists dictionary_insert on schedule_portal.dictionary;
create policy dictionary_insert on schedule_portal.dictionary
  for insert to authenticated
  with check (organization_id = schedule_portal.my_org() and schedule_portal.can_edit());

drop policy if exists dictionary_update on schedule_portal.dictionary;
create policy dictionary_update on schedule_portal.dictionary
  for update to authenticated
  using (organization_id = schedule_portal.my_org() and schedule_portal.can_edit())
  with check (organization_id = schedule_portal.my_org() and schedule_portal.can_edit());

drop policy if exists dictionary_delete on schedule_portal.dictionary;
create policy dictionary_delete on schedule_portal.dictionary
  for delete to authenticated
  using (organization_id = schedule_portal.my_org() and schedule_portal.is_admin());
