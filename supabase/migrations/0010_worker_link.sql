-- ============================================================================
-- Schedule_Portal — D6: memberships.worker_id (operator "assigned" scope)
-- Closes the G1.6 documented gap: there was no membership↔worker link, so the
-- operator scope from permissions-matrix.md ("only cards on my own worker list")
-- was approximated by region. This migration makes it exact, and delivers the
-- notification producers that were deferred in 0009 pending this link.
--
-- PREREQUISITE: 0009_notifications_audit.sql (notifications table).
-- STATUS: ready to deploy — NOT yet applied (no Supabase access from build env).
-- Additive + policy replacement; never touches public.* or other apps.
--
-- Semantics (permissions-matrix.md, scope "assigned"):
--  * Operator WITH worker link: sees pool lists + their own list; sees/edits
--    cards only on their own list; may reorder within their own list; FSM
--    transitions restricted to their own cards ("operator (próprio)").
--  * Operator WITHOUT link: unchanged fallback = region scope (safe superset,
--    as in 0007). Link them to tighten.
--  * All other roles: behavior identical to 0007.
-- ============================================================================

-- ── 1. Schema ────────────────────────────────────────────────────────────────
alter table schedule_portal.memberships
  add column if not exists worker_id uuid references schedule_portal.workers(id) on delete set null;
-- one login per worker
create unique index if not exists memberships_worker_uidx
  on schedule_portal.memberships(worker_id) where worker_id is not null;

-- ── 2. Helpers ───────────────────────────────────────────────────────────────
create or replace function schedule_portal.my_worker() returns uuid
language sql stable security definer set search_path = schedule_portal as $$
  select worker_id from schedule_portal.memberships
  where user_id = auth.uid() and status = 'active' limit 1;
$$;
grant execute on function schedule_portal.my_worker() to authenticated;

-- Operator whose membership is linked to a worker → strict "assigned" scope.
create or replace function schedule_portal.operator_assigned() returns boolean
language sql stable security definer set search_path = schedule_portal as $$
  select coalesce(schedule_portal.my_role() = 'operator'
                  and schedule_portal.my_worker() is not null, false);
$$;
grant execute on function schedule_portal.operator_assigned() to authenticated;

-- Visibility of a list. Checked BEFORE sees_all_regions so a linked operator
-- with region='all' is still confined to their own list.
create or replace function schedule_portal.list_in_scope(p_worker_id uuid, p_is_pool boolean)
returns boolean language sql stable security definer set search_path = schedule_portal as $$
  select case
    when schedule_portal.operator_assigned()
      then coalesce(p_is_pool, false) or p_worker_id = schedule_portal.my_worker()
    when schedule_portal.sees_all_regions() then true
    when coalesce(p_is_pool, false) then true
    else exists (select 1 from schedule_portal.workers w
                 where w.id = p_worker_id and w.region = schedule_portal.my_region())
  end;
$$;
grant execute on function schedule_portal.list_in_scope(uuid, boolean) to authenticated;

-- Visibility of a card = scope of its list (pool cards stay all-region only,
-- exactly as in 0007; a linked operator sees own-list cards only).
create or replace function schedule_portal.card_scope_ok(p_list_id uuid)
returns boolean language sql stable security definer set search_path = schedule_portal as $$
  select case
    when schedule_portal.operator_assigned() then
      exists (select 1 from schedule_portal.lists l
              where l.id = p_list_id and l.worker_id = schedule_portal.my_worker())
    when schedule_portal.sees_all_regions() then true
    else exists (select 1 from schedule_portal.lists l
                 join schedule_portal.workers w on w.id = l.worker_id
                 where l.id = p_list_id and w.region = schedule_portal.my_region())
  end;
$$;
grant execute on function schedule_portal.card_scope_ok(uuid) to authenticated;

-- ── 3. RLS: replace the 0007 policies with helper-based ones ─────────────────
drop policy if exists lists_read on schedule_portal.lists;
create policy lists_read on schedule_portal.lists
  for select to authenticated using (
    organization_id = schedule_portal.my_org()
    and schedule_portal.list_in_scope(worker_id, is_pool)
  );

-- Allocation is not operator work (matrix: Schedule/allocation = view for operators).
drop policy if exists lists_insert on schedule_portal.lists;
create policy lists_insert on schedule_portal.lists
  for insert to authenticated with check (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit()
    and schedule_portal.my_role() <> 'operator'
    and schedule_portal.list_in_scope(worker_id, is_pool)
  );

drop policy if exists lists_update on schedule_portal.lists;
create policy lists_update on schedule_portal.lists
  for update to authenticated using (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit()
    and schedule_portal.my_role() <> 'operator'
    and schedule_portal.list_in_scope(worker_id, is_pool)
  ) with check (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit()
  );

drop policy if exists cards_read on schedule_portal.cards;
create policy cards_read on schedule_portal.cards
  for select to authenticated using (
    organization_id = schedule_portal.my_org()
    and schedule_portal.card_scope_ok(list_id)
  );

drop policy if exists cards_insert on schedule_portal.cards;
create policy cards_insert on schedule_portal.cards
  for insert to authenticated with check (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit()
    and schedule_portal.card_scope_ok(list_id)
  );

drop policy if exists cards_update on schedule_portal.cards;
create policy cards_update on schedule_portal.cards
  for update to authenticated using (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit()
    and schedule_portal.card_scope_ok(list_id)
  ) with check (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit()
    and schedule_portal.card_scope_ok(list_id)
  );

-- ── 4. RPC guards: "operator (próprio)" now exact ────────────────────────────
-- card_transition: same body as 0007 + assigned guard.
create or replace function schedule_portal.card_transition(
  p_card_id uuid,
  p_to schedule_portal.card_status,
  p_version int
) returns schedule_portal.cards
language plpgsql security definer set search_path = schedule_portal as $$
declare
  c schedule_portal.cards;
  v_from schedule_portal.card_status;
  v_role schedule_portal.role;
  v_ok boolean;
  v_allowed text[];
begin
  select * into c from schedule_portal.cards
  where id = p_card_id and organization_id = schedule_portal.my_org();
  if not found then raise exception 'not_found'; end if;
  if c.version <> p_version then
    raise exception 'version_conflict' using detail = c.version::text;
  end if;

  v_from := c.status;
  v_role := schedule_portal.my_role();

  v_ok := (v_from, p_to) in (
    ('unscheduled','scheduled'),
    ('scheduled','assigned'),
    ('assigned','in_progress'),
    ('in_progress','on_hold'),
    ('on_hold','in_progress'),
    ('in_progress','completed'),
    ('completed','rework'),
    ('rework','in_progress'),
    ('completed','invoiced'),
    ('invoiced','paid')
  ) or (p_to = 'cancelled' and v_from not in ('paid','cancelled'));
  if not v_ok then
    raise exception 'invalid_transition' using detail = format('%s -> %s', v_from, p_to);
  end if;

  if not schedule_portal.can_edit() then raise exception 'forbidden'; end if;

  -- assigned guard (D6): a linked operator only acts on their own list's cards
  if schedule_portal.operator_assigned() then
    if not exists (select 1 from schedule_portal.lists l
                   where l.id = c.list_id and l.worker_id = schedule_portal.my_worker()) then
      raise exception 'forbidden' using detail = 'not_assigned';
    end if;
  elsif not schedule_portal.sees_all_regions() then
    if not exists (select 1 from schedule_portal.lists l
                   join schedule_portal.workers w on w.id = l.worker_id
                   where l.id = c.list_id and w.region = schedule_portal.my_region()) then
      raise exception 'forbidden' using detail = 'out_of_region';
    end if;
  end if;

  v_allowed := case p_to
    when 'scheduled'   then array['coordinator','supervisor']
    when 'assigned'    then array['coordinator','supervisor']
    when 'in_progress' then array['operator','supervisor']
    when 'on_hold'     then array['operator','supervisor']
    when 'completed'   then array['operator','supervisor']
    when 'rework'      then array['supervisor','coordinator']
    when 'invoiced'    then array['finance']
    when 'paid'        then array['finance']
    when 'cancelled'   then array['coordinator']
    else array[]::text[] end;
  if v_role <> 'admin' and not (v_role::text = any(v_allowed)) then
    raise exception 'forbidden' using detail = format('role %s cannot set %s', v_role, p_to);
  end if;

  update schedule_portal.cards
     set status = p_to,
         done = case when p_to in ('completed','invoiced','paid') then true
                     when p_to = 'rework' then false
                     else done end,
         version = version + 1
   where id = p_card_id
  returning * into c;

  insert into schedule_portal.audit_events
    (organization_id, actor_user_id, verb, entity_type, entity_id, detail)
  values (c.organization_id, auth.uid(),
          case when p_to = 'completed' then 'COMPLETE' else 'UPDATE' end,
          'card', c.id, jsonb_build_object('from', v_from, 'to', p_to));

  return c;
end;
$$;

-- card_move: same body as 0007 + assigned guard (linked operator = reorder
-- within their own list only; moving to another worker is scheduler work).
create or replace function schedule_portal.card_move(
  p_card_id uuid,
  p_to_list_id uuid,
  p_position numeric,
  p_version int
) returns schedule_portal.cards
language plpgsql security definer set search_path = schedule_portal as $$
declare c schedule_portal.cards; v_from uuid;
begin
  if not schedule_portal.can_edit() then raise exception 'forbidden'; end if;

  select * into c from schedule_portal.cards
  where id = p_card_id and organization_id = schedule_portal.my_org();
  if not found then raise exception 'not_found'; end if;
  if c.version <> p_version then
    raise exception 'version_conflict' using detail = c.version::text;
  end if;

  if not exists (select 1 from schedule_portal.lists l
                 where l.id = p_to_list_id
                   and l.board_id = c.board_id
                   and l.organization_id = c.organization_id) then
    raise exception 'invalid_list';
  end if;

  if schedule_portal.operator_assigned() then
    if not exists (select 1 from schedule_portal.lists l
                   where l.id = c.list_id and l.worker_id = schedule_portal.my_worker())
    or not exists (select 1 from schedule_portal.lists l
                   where l.id = p_to_list_id and l.worker_id = schedule_portal.my_worker()) then
      raise exception 'forbidden' using detail = 'not_assigned';
    end if;
  elsif not schedule_portal.sees_all_regions() then
    if not exists (select 1 from schedule_portal.lists l
                   join schedule_portal.workers w on w.id = l.worker_id
                   where l.id = c.list_id and w.region = schedule_portal.my_region())
    or not exists (select 1 from schedule_portal.lists l
                   join schedule_portal.workers w on w.id = l.worker_id
                   where l.id = p_to_list_id and w.region = schedule_portal.my_region()) then
      raise exception 'forbidden' using detail = 'out_of_region';
    end if;
  end if;

  v_from := c.list_id;
  update schedule_portal.cards
     set list_id = p_to_list_id, position = p_position, version = version + 1
   where id = p_card_id
  returning * into c;

  insert into schedule_portal.audit_events
    (organization_id, actor_user_id, verb, entity_type, entity_id, detail)
  values (c.organization_id, auth.uid(), 'MOVE', 'card', c.id,
          jsonb_build_object('fromListId', v_from, 'toListId', p_to_list_id, 'position', p_position));

  return c;
end;
$$;

-- ── 5. Notification producers deferred from 0009 (now expressible) ───────────
-- assignment.new — a card lands on a worker's list → notify the linked member.
create or replace function schedule_portal.notify_card_assigned() returns trigger
language plpgsql security definer set search_path = schedule_portal as $$
declare v_uid uuid; v_title text;
begin
  if tg_op = 'UPDATE' and new.list_id is not distinct from old.list_id then return new; end if;
  select m.user_id into v_uid
    from schedule_portal.lists l
    join schedule_portal.memberships m on m.worker_id = l.worker_id and m.status = 'active'
   where l.id = new.list_id and m.user_id is not null
   limit 1;
  if v_uid is null or v_uid is not distinct from auth.uid() then return new; end if;
  v_title := coalesce(new.raw_title,
                      nullif(concat_ws(' · ', new.client_text, new.service_type), ''),
                      'New service');
  insert into schedule_portal.notifications (organization_id, user_id, kind, title, body, entity_type, entity_id)
  values (new.organization_id, v_uid, 'assignment', 'New assignment', left(v_title, 200), 'card', new.id);
  return new;
end;
$$;
drop trigger if exists trg_notify_card_assigned on schedule_portal.cards;
create trigger trg_notify_card_assigned
  after insert or update of list_id on schedule_portal.cards
  for each row execute function schedule_portal.notify_card_assigned();

-- service.completed — notify the supervisors of the worker's region.
create or replace function schedule_portal.notify_service_completed() returns trigger
language plpgsql security definer set search_path = schedule_portal as $$
declare v_region schedule_portal.region;
begin
  if new.status <> 'completed' or old.status is not distinct from new.status then return new; end if;
  select w.region into v_region
    from schedule_portal.lists l
    join schedule_portal.workers w on w.id = l.worker_id
   where l.id = new.list_id;
  insert into schedule_portal.notifications (organization_id, user_id, kind, title, body, entity_type, entity_id)
  select new.organization_id, m.user_id, 'status', 'Service completed',
         left(coalesce(new.raw_title, nullif(concat_ws(' · ', new.client_text, new.service_type), ''), 'Service'), 180) || ' marked completed',
         'card', new.id
    from schedule_portal.memberships m
   where m.status = 'active' and m.user_id is not null
     and m.role = 'supervisor'
     and (m.region = 'all' or (v_region is not null and m.region = v_region))
     and m.user_id is distinct from auth.uid();
  return new;
end;
$$;
drop trigger if exists trg_notify_service_completed on schedule_portal.cards;
create trigger trg_notify_service_completed
  after update of status on schedule_portal.cards
  for each row execute function schedule_portal.notify_service_completed();

-- integration.dlq — notify coordinators + admins.
create or replace function schedule_portal.notify_integration_dlq() returns trigger
language plpgsql security definer set search_path = schedule_portal as $$
begin
  if new.status <> 'dlq' or (tg_op = 'UPDATE' and old.status is not distinct from 'dlq') then return new; end if;
  insert into schedule_portal.notifications (organization_id, user_id, kind, title, body, entity_type, entity_id)
  select new.organization_id, m.user_id, 'integration', 'Integration error',
         coalesce(new.entity_type, 'event') || ' fell into the DLQ' ||
           coalesce(' — ' || left(new.last_error, 140), ''),
         'integration_event', new.id
    from schedule_portal.memberships m
   where m.status = 'active' and m.user_id is not null
     and m.role in ('admin', 'coordinator');
  return new;
end;
$$;
drop trigger if exists trg_notify_integration_dlq on schedule_portal.integration_events;
create trigger trg_notify_integration_dlq
  after insert or update of status on schedule_portal.integration_events
  for each row execute function schedule_portal.notify_integration_dlq();
