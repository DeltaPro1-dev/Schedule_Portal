-- ============================================================================
-- Schedule_Portal — full audit via database triggers (G1.7)
-- Makes audit_events capture EVERY domain mutation, non-forgeably, on the server
-- (events.md verbs: LOGIN, CREATE, UPDATE, MOVE, COMPLETE, EXPORT, DELETE).
--
-- Why triggers: the client can't insert audit rows (the INSERT policy was removed
-- in 0005 — audit is server-only). A SECURITY DEFINER trigger owned by the schema
-- owner writes audit rows regardless of RLS, and fires for BOTH direct PostgREST
-- writes (create board/card, toggle done, checklist, comment, attachment, member,
-- export) AND the RPC writes — one uniform, tamper-proof source of truth.
--
-- Run once in the SQL Editor (migrations 0001-0007 already applied).
-- ============================================================================

-- One trigger function for every audited table. Resolves org, verb and a small
-- detail payload; writes an audit_events row. AFTER-trigger, never blocks reads.
create or replace function schedule_portal.audit_row() returns trigger
language plpgsql security definer set search_path = schedule_portal as $$
declare
  v_org uuid;
  v_verb text;
  v_id uuid;
  v_detail jsonb := '{}'::jsonb;
  v_rec record;
begin
  if TG_OP = 'DELETE' then v_rec := OLD; else v_rec := NEW; end if;
  v_id := v_rec.id;

  -- Creating a board auto-generates the pool + one list per worker (~20 rows).
  -- Skip logging those list CREATEs to keep the audit readable; the board's own
  -- CREATE is still recorded. (Manual list adds are therefore not audited either.)
  if TG_TABLE_NAME = 'lists' and TG_OP = 'INSERT' then
    return NEW;
  end if;

  -- organization_id: direct column, or resolved through the parent card
  if TG_TABLE_NAME in ('boards','lists','cards','workers','clients','memberships','exports') then
    v_org := v_rec.organization_id;
  elsif TG_TABLE_NAME in ('checklist_items','comments','attachments') then
    select c.organization_id into v_org from schedule_portal.cards c where c.id = v_rec.card_id;
  end if;

  -- verb
  if TG_OP = 'INSERT' then
    v_verb := case when TG_TABLE_NAME = 'exports' then 'EXPORT' else 'CREATE' end;
  elsif TG_OP = 'DELETE' then
    v_verb := 'DELETE';
  else -- UPDATE
    if TG_TABLE_NAME = 'cards' then
      if OLD.deleted_at is null and NEW.deleted_at is not null then v_verb := 'DELETE';
      elsif OLD.list_id is distinct from NEW.list_id then v_verb := 'MOVE';
      elsif OLD.status is distinct from NEW.status and NEW.status = 'completed' then v_verb := 'COMPLETE';
      else v_verb := 'UPDATE';
      end if;
    elsif TG_TABLE_NAME in ('workers','clients') then
      v_verb := case when OLD.deleted_at is null and NEW.deleted_at is not null then 'DELETE' else 'UPDATE' end;
    else
      v_verb := 'UPDATE';
    end if;
  end if;

  -- detail payload (OLD only referenced on UPDATE paths)
  if TG_TABLE_NAME = 'boards' then
    v_detail := jsonb_build_object('title', v_rec.title, 'date', v_rec.date);
  elsif TG_TABLE_NAME = 'lists' then
    v_detail := jsonb_build_object('name', v_rec.name);
  elsif TG_TABLE_NAME = 'cards' then
    if v_verb = 'MOVE' then
      v_detail := jsonb_build_object('fromListId', OLD.list_id, 'toListId', NEW.list_id);
    elsif TG_OP = 'UPDATE' then
      v_detail := jsonb_build_object('from', OLD.status, 'to', NEW.status);
    else
      v_detail := jsonb_build_object('status', v_rec.status, 'list_id', v_rec.list_id);
    end if;
  elsif TG_TABLE_NAME = 'workers' then
    v_detail := jsonb_build_object('name', v_rec.name, 'kind', v_rec.kind);
  elsif TG_TABLE_NAME = 'clients' then
    v_detail := jsonb_build_object('name', v_rec.name);
  elsif TG_TABLE_NAME = 'memberships' then
    v_detail := jsonb_build_object('invited_email', v_rec.invited_email, 'role', v_rec.role, 'access', v_rec.access, 'status', v_rec.status);
  elsif TG_TABLE_NAME = 'checklist_items' then
    v_detail := jsonb_build_object('text', v_rec.text, 'done', v_rec.done);
  elsif TG_TABLE_NAME = 'comments' then
    v_detail := jsonb_build_object('snippet', left(coalesce(v_rec.body,''), 80));
  elsif TG_TABLE_NAME = 'attachments' then
    v_detail := jsonb_build_object('filename', v_rec.filename);
  elsif TG_TABLE_NAME = 'exports' then
    v_detail := jsonb_build_object('report_type', v_rec.report_type, 'format', v_rec.format);
  end if;

  if v_org is not null then
    insert into schedule_portal.audit_events
      (organization_id, actor_user_id, actor_kind, verb, entity_type, entity_id, detail)
    values (v_org, auth.uid(),
            case when auth.uid() is null then 'system' else 'user' end,
            v_verb, TG_TABLE_NAME, v_id, v_detail);
  end if;

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

-- Attach to every audited table (idempotent).
do $$
declare t text;
begin
  foreach t in array array[
    'boards','lists','cards','workers','clients','memberships',
    'checklist_items','comments','attachments','exports'
  ] loop
    execute format('drop trigger if exists audit_%1$s on schedule_portal.%1$s;', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on schedule_portal.%1$s
         for each row execute function schedule_portal.audit_row();', t);
  end loop;
end $$;

-- LOGIN: called by the SPA right after a successful sign-in.
create or replace function schedule_portal.audit_login() returns void
language plpgsql security definer set search_path = schedule_portal as $$
declare v_org uuid;
begin
  v_org := schedule_portal.my_org();
  if v_org is not null then
    insert into schedule_portal.audit_events
      (organization_id, actor_user_id, actor_kind, verb, entity_type, detail)
    values (v_org, auth.uid(), 'user', 'LOGIN', 'session', '{}'::jsonb);
  end if;
end;
$$;
grant execute on function schedule_portal.audit_login() to authenticated;

-- ── De-duplicate: the trigger is now the single source of audit truth, so the
-- RPCs must NOT also insert audit rows. Redefine them (from 0007) without the
-- explicit audit insert; everything else (role matrix, region guard) unchanged.
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

  if not schedule_portal.sees_all_regions() then
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

  return c;   -- audit written by the cards trigger
end;
$$;

create or replace function schedule_portal.card_move(
  p_card_id uuid,
  p_to_list_id uuid,
  p_position numeric,
  p_version int
) returns schedule_portal.cards
language plpgsql security definer set search_path = schedule_portal as $$
declare c schedule_portal.cards;
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

  update schedule_portal.cards
     set list_id = p_to_list_id, position = p_position, version = version + 1
   where id = p_card_id
  returning * into c;

  return c;   -- audit (MOVE) written by the cards trigger
end;
$$;
