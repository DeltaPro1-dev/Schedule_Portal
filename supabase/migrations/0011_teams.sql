-- Schedule_Portal — G5: teams (Team / TeamMember from the contract's data model)
-- STATUS: ready to deploy — NOT yet applied (no Supabase access from build env).
-- Additive only. RLS follows the standard org-scoped pattern from 0002
-- (select = member, write = editor, delete = admin).

create table if not exists schedule_portal.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  name text not null,
  region schedule_portal.region,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists schedule_portal.team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  team_id uuid not null references schedule_portal.teams(id) on delete cascade,
  worker_id uuid not null references schedule_portal.workers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, worker_id)
);
create index if not exists team_members_team_idx on schedule_portal.team_members(team_id);

do $$
declare t text;
begin
  foreach t in array array['teams','team_members'] loop
    execute format('alter table schedule_portal.%I enable row level security;', t);
    execute format('grant select, insert, update, delete on schedule_portal.%I to authenticated;', t);

    execute format($f$create policy %1$I on schedule_portal.%2$I
      for select to authenticated using (organization_id = schedule_portal.my_org());$f$,
      t||'_read', t);

    execute format($f$create policy %1$I on schedule_portal.%2$I
      for insert to authenticated
      with check (organization_id = schedule_portal.my_org() and schedule_portal.can_edit());$f$,
      t||'_insert', t);

    execute format($f$create policy %1$I on schedule_portal.%2$I
      for update to authenticated
      using (organization_id = schedule_portal.my_org() and schedule_portal.can_edit())
      with check (organization_id = schedule_portal.my_org() and schedule_portal.can_edit());$f$,
      t||'_update', t);

  end loop;
end $$;

-- Deletes: teams are archived (soft delete via update), hard-delete stays admin.
-- team_members rows are link rows — removing a worker from a team is routine
-- editor work, so delete is editor-level there.
create policy teams_delete on schedule_portal.teams
  for delete to authenticated
  using (organization_id = schedule_portal.my_org() and schedule_portal.is_admin());
create policy team_members_delete on schedule_portal.team_members
  for delete to authenticated
  using (organization_id = schedule_portal.my_org() and schedule_portal.can_edit());
