-- Schedule_Portal — in-app notifications + audit governance (G4)
-- STATUS: ready to deploy — NOT yet applied to the shared project (no access from
-- the build env). Additive only; never touches public.* or other apps.

-- ── 1. Notifications ─────────────────────────────────────────────────────────
create table if not exists schedule_portal.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('assignment','status','comment','mention','export','integration')),
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notif_user_idx on schedule_portal.notifications(user_id, read, created_at desc);

alter table schedule_portal.notifications enable row level security;
-- A user sees and updates (mark read) only their own notifications.
drop policy if exists notif_read on schedule_portal.notifications;
create policy notif_read on schedule_portal.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_update on schedule_portal.notifications;
create policy notif_update on schedule_portal.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No authenticated INSERT: notifications are produced by SECURITY DEFINER triggers
-- (below) or the service role — never client-forgeable (same stance as audit_events).

grant select, update on schedule_portal.notifications to authenticated;

-- ── 2. Producer: export.ready ────────────────────────────────────────────────
-- When an export row reaches 'done', notify the requester. Fires for both the
-- client-side logged exports and the async worker. Definer bypasses the no-insert
-- policy above.
create or replace function schedule_portal.notify_export_ready() returns trigger
language plpgsql security definer set search_path = schedule_portal as $$
begin
  if new.status = 'done' and new.requested_by is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    insert into schedule_portal.notifications (organization_id, user_id, kind, title, body, entity_type, entity_id)
    values (new.organization_id, new.requested_by, 'export',
            'Export ready',
            coalesce(new.report_type, 'Export') || ' (' || upper(new.format::text) || ') finished'
              || case when new.row_count is not null then ' · ' || new.row_count || ' rows' else '' end,
            'export', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_export_ready on schedule_portal.exports;
create trigger trg_notify_export_ready
  after insert or update of status on schedule_portal.exports
  for each row execute function schedule_portal.notify_export_ready();

-- Further producers (assignment.new, service.completed, integration.dlq) are
-- follow-ups: assignment needs the membership↔worker link (decision D6);
-- service.completed/integration.dlq target a role+region audience and will be
-- added as triggers once D6 lands. Documented in DECISIONS.md (G4.1), not faked.

-- ── 3. Audit governance: correlation / request / session ids ─────────────────
alter table schedule_portal.audit_events add column if not exists correlation_id uuid;
alter table schedule_portal.audit_events add column if not exists request_id text;
alter table schedule_portal.audit_events add column if not exists session_id text;

-- ── 4. Retention (configurable) ──────────────────────────────────────────────
-- Immutable audit is kept long-term (contract: ≥2 years). These helpers let an
-- admin/cron prune beyond a chosen horizon; defaults are conservative. Invoke from
-- pg_cron, e.g. select schedule_portal.prune_notifications(90);
create or replace function schedule_portal.prune_notifications(p_days int default 90)
returns integer language plpgsql security definer set search_path = schedule_portal as $$
declare n integer;
begin
  delete from schedule_portal.notifications
   where read = true and created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function schedule_portal.prune_audit(p_days int default 730)
returns integer language plpgsql security definer set search_path = schedule_portal as $$
declare n integer;
begin
  -- guardrail: never prune less than the 2-year contract minimum
  if p_days < 730 then raise exception 'audit retention floor is 730 days'; end if;
  delete from schedule_portal.audit_events where created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end;
$$;
