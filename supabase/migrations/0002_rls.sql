-- ============================================================================
-- Schedule_Portal — grants, helper functions, provisioning, RLS
-- See permissions-matrix.md (G0). All helpers are schema-scoped in
-- schedule_portal.* so they never collide with the other apps in this project.
--
-- MVP scope: access-level RLS (admin/editor/none) + org isolation. The finer
-- role×region matrix (supervisor = own region, operator = own list) and the
-- service state-machine are enforced in RPCs / Edge Functions (see 0004),
-- because RLS bypass via service_role is how business transitions run.
-- ============================================================================

-- ── Grants (RLS still gates rows) ────────────────────────────────────────────
grant usage on schema schedule_portal to authenticated, anon, service_role;
grant select, insert, update, delete on all tables in schema schedule_portal to authenticated;
grant all on all tables in schema schedule_portal to service_role;
alter default privileges in schema schedule_portal
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema schedule_portal
  grant all on tables to service_role;

-- ── Helper functions (SECURITY DEFINER → avoid RLS recursion on memberships) ──
create or replace function schedule_portal.my_org() returns uuid
language sql stable security definer set search_path = schedule_portal as $$
  select organization_id from schedule_portal.memberships
  where user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function schedule_portal.my_access() returns schedule_portal.access
language sql stable security definer set search_path = schedule_portal as $$
  select access from schedule_portal.memberships
  where user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function schedule_portal.my_role() returns schedule_portal.role
language sql stable security definer set search_path = schedule_portal as $$
  select role from schedule_portal.memberships
  where user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function schedule_portal.my_region() returns schedule_portal.region
language sql stable security definer set search_path = schedule_portal as $$
  select region from schedule_portal.memberships
  where user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function schedule_portal.is_member() returns boolean
language sql stable security definer set search_path = schedule_portal as $$
  select exists (select 1 from schedule_portal.memberships
                 where user_id = auth.uid() and status = 'active');
$$;

create or replace function schedule_portal.can_edit() returns boolean
language sql stable security definer set search_path = schedule_portal as $$
  select coalesce(schedule_portal.my_access() in ('admin','editor'), false);
$$;

create or replace function schedule_portal.is_admin() returns boolean
language sql stable security definer set search_path = schedule_portal as $$
  select coalesce(schedule_portal.my_access() = 'admin', false);
$$;

-- ── Provisioning: attach the logged-in auth user to an invited membership ─────
-- Called by the SPA right after login. No shared signup trigger (project is shared).
create or replace function schedule_portal.provision_me()
returns schedule_portal.memberships
language plpgsql security definer set search_path = schedule_portal as $$
declare
  v_email text;
  v_m schedule_portal.memberships;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return null; end if;

  -- already provisioned?
  select * into v_m from schedule_portal.memberships
  where user_id = auth.uid() and status = 'active' limit 1;
  if found then return v_m; end if;

  -- claim an invite matching this email
  update schedule_portal.memberships
     set user_id = auth.uid(), status = 'active'
   where lower(invited_email) = lower(v_email) and status = 'invited'
  returning * into v_m;

  return v_m;   -- null if no invite → SPA signs the user out
end;
$$;
grant execute on function schedule_portal.provision_me() to authenticated;
grant execute on function schedule_portal.my_org()   to authenticated;
grant execute on function schedule_portal.my_access() to authenticated;
grant execute on function schedule_portal.my_role()  to authenticated;
grant execute on function schedule_portal.my_region() to authenticated;
grant execute on function schedule_portal.is_member() to authenticated;
grant execute on function schedule_portal.can_edit() to authenticated;
grant execute on function schedule_portal.is_admin() to authenticated;

-- ── RLS: organizations & memberships ─────────────────────────────────────────
alter table schedule_portal.organizations enable row level security;
create policy org_read on schedule_portal.organizations
  for select to authenticated using (id = schedule_portal.my_org());

alter table schedule_portal.memberships enable row level security;
create policy memberships_read on schedule_portal.memberships
  for select to authenticated
  using (user_id = auth.uid() or schedule_portal.is_admin());
create policy memberships_admin_write on schedule_portal.memberships
  for all to authenticated
  using (schedule_portal.is_admin() and organization_id = schedule_portal.my_org())
  with check (schedule_portal.is_admin() and organization_id = schedule_portal.my_org());

-- ── RLS: org-scoped domain tables (select=member, write=editor, delete=admin) ─
do $$
declare t text;
begin
  foreach t in array array['workers','clients','boards','lists','cards','labels'] loop
    execute format('alter table schedule_portal.%I enable row level security;', t);

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

    execute format($f$create policy %1$I on schedule_portal.%2$I
      for delete to authenticated
      using (organization_id = schedule_portal.my_org() and schedule_portal.is_admin());$f$,
      t||'_delete', t);
  end loop;
end $$;

-- ── RLS: card children (scoped through the parent card's org) ────────────────
create or replace function schedule_portal.card_in_my_org(p_card_id uuid) returns boolean
language sql stable security definer set search_path = schedule_portal as $$
  select exists (select 1 from schedule_portal.cards c
                 where c.id = p_card_id and c.organization_id = schedule_portal.my_org());
$$;
grant execute on function schedule_portal.card_in_my_org(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['card_labels','checklist_items','comments','attachments'] loop
    execute format('alter table schedule_portal.%I enable row level security;', t);
    execute format($f$create policy %1$I on schedule_portal.%2$I
      for select to authenticated using (schedule_portal.card_in_my_org(card_id));$f$, t||'_read', t);
    execute format($f$create policy %1$I on schedule_portal.%2$I
      for insert to authenticated
      with check (schedule_portal.card_in_my_org(card_id) and schedule_portal.can_edit());$f$, t||'_insert', t);
    execute format($f$create policy %1$I on schedule_portal.%2$I
      for update to authenticated
      using (schedule_portal.card_in_my_org(card_id) and schedule_portal.can_edit())
      with check (schedule_portal.card_in_my_org(card_id) and schedule_portal.can_edit());$f$, t||'_update', t);
    execute format($f$create policy %1$I on schedule_portal.%2$I
      for delete to authenticated
      using (schedule_portal.card_in_my_org(card_id) and schedule_portal.is_admin());$f$, t||'_delete', t);
  end loop;
end $$;

-- ── RLS: audit_events (immutable: members read, insert; no update/delete) ─────
alter table schedule_portal.audit_events enable row level security;
create policy audit_read on schedule_portal.audit_events
  for select to authenticated using (organization_id = schedule_portal.my_org());
create policy audit_insert on schedule_portal.audit_events
  for insert to authenticated
  with check (organization_id = schedule_portal.my_org());

-- ── RLS: exports & integration_events (members read own org; write via service) ─
alter table schedule_portal.exports enable row level security;
create policy exports_read on schedule_portal.exports
  for select to authenticated using (organization_id = schedule_portal.my_org());
create policy exports_insert on schedule_portal.exports
  for insert to authenticated
  with check (organization_id = schedule_portal.my_org() and requested_by = auth.uid());

alter table schedule_portal.integration_events enable row level security;
create policy integration_read on schedule_portal.integration_events
  for select to authenticated using (organization_id = schedule_portal.my_org());
