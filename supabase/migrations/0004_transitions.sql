-- ============================================================================
-- Schedule_Portal — service state machine + move, as RPCs
-- Implements service-state-machine.md. Called from the SPA; both use optimistic
-- concurrency (client sends the version it last saw) and write an AuditEvent.
-- ============================================================================

-- Allowed transitions (see service-state-machine.md). Role gating is coarse for
-- MVP: editors do operational transitions; finance owns invoiced/paid; cancel
-- needs coordinator/admin. Refine to the full matrix later.
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
  ) or (p_to = 'cancelled' and v_from <> 'paid');

  if not v_ok then
    raise exception 'invalid_transition' using detail = format('%s -> %s', v_from, p_to);
  end if;

  -- coarse role gate
  if p_to in ('invoiced','paid') and coalesce(v_role in ('finance','admin'), false) = false then
    raise exception 'forbidden' using detail = 'finance role required';
  elsif p_to = 'cancelled' and coalesce(v_role in ('coordinator','admin'), false) = false then
    raise exception 'forbidden' using detail = 'coordinator role required';
  elsif not schedule_portal.can_edit() then
    raise exception 'forbidden';
  end if;

  update schedule_portal.cards
     set status = p_to,
         done = (p_to = 'completed'),
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
grant execute on function schedule_portal.card_transition(uuid, schedule_portal.card_status, int) to authenticated;

-- Move a card between lists / positions. Does NOT change status (per contract).
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
grant execute on function schedule_portal.card_move(uuid, uuid, numeric, int) to authenticated;
