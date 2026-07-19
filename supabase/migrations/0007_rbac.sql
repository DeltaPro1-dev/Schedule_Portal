-- ============================================================================
-- Schedule_Portal — finer RBAC: role gates in the RPCs + region scoping on
-- lists/cards. Implements permissions-matrix.md and service-state-machine.md
-- as far as the current schema allows. Run once in the SQL Editor
-- (migrations 0001-0006 already applied).
--
-- MODEL NOTES / documented gaps (need a contract+schema decision — Regra de Ouro):
--  * There is no membership<->worker link, so operator "assigned" scope ("only
--    cards on my own list") is NOT expressible. Operators are treated as
--    REGION-scoped here (a safe superset). Add memberships.worker_id later to
--    tighten to per-list.
--  * Boards span regions (one board/day, many workers). Region is a property of
--    the worker behind a list, so region scoping is applied to LISTS and CARDS
--    (via lists.worker_id -> workers.region), not to boards. Pool lists
--    (worker_id null) are visible to everyone; their cards are visible only to
--    all-region roles.
--
-- Access (admin/editor/none) still gates writes via can_edit(); role/region add
-- ON TOP. Today the only member is admin/region=all, who sees & does everything.
-- ============================================================================

-- Members who see every region: admin/coordinator/finance/viewer, or region=all.
-- Supervisors (and, pending the worker link, operators) are region-scoped.
create or replace function schedule_portal.sees_all_regions() returns boolean
language sql stable security definer set search_path = schedule_portal as $$
  select coalesce(
    schedule_portal.my_role() in ('admin','coordinator','finance','viewer')
    or schedule_portal.my_region() = 'all', false);
$$;
grant execute on function schedule_portal.sees_all_regions() to authenticated;

-- ── RLS: region scoping on lists ─────────────────────────────────────────────
-- Visible when all-region, or the list is the pool, or the list's worker is in
-- the member's region. Writes additionally require can_edit(); delete stays admin.
drop policy if exists lists_read on schedule_portal.lists;
create policy lists_read on schedule_portal.lists
  for select to authenticated using (
    organization_id = schedule_portal.my_org() and (
      schedule_portal.sees_all_regions()
      or is_pool
      or exists (select 1 from schedule_portal.workers w
                 where w.id = lists.worker_id and w.region = schedule_portal.my_region())
    )
  );

drop policy if exists lists_insert on schedule_portal.lists;
create policy lists_insert on schedule_portal.lists
  for insert to authenticated with check (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit() and (
      schedule_portal.sees_all_regions()
      or is_pool
      or exists (select 1 from schedule_portal.workers w
                 where w.id = lists.worker_id and w.region = schedule_portal.my_region())
    )
  );

drop policy if exists lists_update on schedule_portal.lists;
create policy lists_update on schedule_portal.lists
  for update to authenticated using (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit() and (
      schedule_portal.sees_all_regions()
      or is_pool
      or exists (select 1 from schedule_portal.workers w
                 where w.id = lists.worker_id and w.region = schedule_portal.my_region())
    )
  ) with check (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit()
  );

-- ── RLS: region scoping on cards (via the list's worker region) ──────────────
drop policy if exists cards_read on schedule_portal.cards;
create policy cards_read on schedule_portal.cards
  for select to authenticated using (
    organization_id = schedule_portal.my_org() and (
      schedule_portal.sees_all_regions()
      or exists (select 1 from schedule_portal.lists l
                 join schedule_portal.workers w on w.id = l.worker_id
                 where l.id = cards.list_id and w.region = schedule_portal.my_region())
    )
  );

drop policy if exists cards_insert on schedule_portal.cards;
create policy cards_insert on schedule_portal.cards
  for insert to authenticated with check (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit() and (
      schedule_portal.sees_all_regions()
      or exists (select 1 from schedule_portal.lists l
                 join schedule_portal.workers w on w.id = l.worker_id
                 where l.id = cards.list_id and w.region = schedule_portal.my_region())
    )
  );

drop policy if exists cards_update on schedule_portal.cards;
create policy cards_update on schedule_portal.cards
  for update to authenticated using (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit() and (
      schedule_portal.sees_all_regions()
      or exists (select 1 from schedule_portal.lists l
                 join schedule_portal.workers w on w.id = l.worker_id
                 where l.id = cards.list_id and w.region = schedule_portal.my_region())
    )
  ) with check (
    organization_id = schedule_portal.my_org() and schedule_portal.can_edit()
  );

-- ── RPC: card_transition with the full role matrix + region guard ────────────
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

  -- structural validity (service-state-machine.md)
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

  -- access level must allow editing at all
  if not schedule_portal.can_edit() then raise exception 'forbidden'; end if;

  -- region guard (supervisors / region-scoped roles only act in their region)
  if not schedule_portal.sees_all_regions() then
    if not exists (select 1 from schedule_portal.lists l
                   join schedule_portal.workers w on w.id = l.worker_id
                   where l.id = c.list_id and w.region = schedule_portal.my_region()) then
      raise exception 'forbidden' using detail = 'out_of_region';
    end if;
  end if;

  -- role matrix per target state (admin may do anything)
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

-- ── RPC: card_move gains a region guard (source + target) ────────────────────
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

  -- target list must belong to the same board & org
  if not exists (select 1 from schedule_portal.lists l
                 where l.id = p_to_list_id
                   and l.board_id = c.board_id
                   and l.organization_id = c.organization_id) then
    raise exception 'invalid_list';
  end if;

  -- region guard: source and target list must be in the member's region
  if not schedule_portal.sees_all_regions() then
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
