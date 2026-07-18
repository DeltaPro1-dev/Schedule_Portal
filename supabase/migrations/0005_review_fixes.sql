-- ============================================================================
-- Schedule_Portal — review fixes (run once in SQL Editor; migrations 0001-0004
-- already applied). Addresses two findings from the PR review.
-- ============================================================================

-- Finding: audit_events INSERT was client-forgeable (any member could insert
-- arbitrary rows via PostgREST). Legit writes go through SECURITY DEFINER RPCs
-- (which bypass RLS), so authenticated users need no direct INSERT. Remove it.
drop policy if exists audit_insert on schedule_portal.audit_events;

-- Finding: card_transition reset done=false on every non-completed transition,
-- so completed -> invoiced -> paid flipped done back to false. Keep done true
-- once the work is completed/invoiced/paid.
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
  ) or (p_to = 'cancelled' and v_from not in ('paid','cancelled'));

  if not v_ok then
    raise exception 'invalid_transition' using detail = format('%s -> %s', v_from, p_to);
  end if;

  if p_to in ('invoiced','paid') and coalesce(v_role in ('finance','admin'), false) = false then
    raise exception 'forbidden' using detail = 'finance role required';
  elsif p_to = 'cancelled' and coalesce(v_role in ('coordinator','admin'), false) = false then
    raise exception 'forbidden' using detail = 'coordinator role required';
  elsif not schedule_portal.can_edit() then
    raise exception 'forbidden';
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
