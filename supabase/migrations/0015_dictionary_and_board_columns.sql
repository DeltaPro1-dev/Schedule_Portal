-- ============================================================================
-- Schedule_Portal — (1) auto-generate employee columns on mapped boards, and
-- (2) a service dictionary so imported cards are standardized.
-- ============================================================================

-- ── (1) Board column seeding: pool + one column per active employee ──────────
-- Mirrors the app's "new board → one list per active worker". Idempotent: only
-- adds the pool / a worker column when it isn't already present.
create or replace function schedule_portal.seed_board_columns(p_board uuid, p_org uuid)
returns void
language plpgsql security definer set search_path = schedule_portal as $$
begin
  if not exists (select 1 from schedule_portal.lists where board_id = p_board and is_pool) then
    insert into schedule_portal.lists (organization_id, board_id, name, position, is_pool)
    values (p_org, p_board, 'DELTA OFFICE / WAREHOUSE', 0, true);
  end if;

  insert into schedule_portal.lists (organization_id, board_id, worker_id, name, position, is_pool)
  select p_org, p_board, w.id, w.name,
         (select coalesce(max(position), -1) from schedule_portal.lists where board_id = p_board)
           + row_number() over (order by w.name),
         false
  from schedule_portal.workers w
  where w.organization_id = p_org and w.kind = 'employee' and w.active and w.deleted_at is null
    and not exists (select 1 from schedule_portal.lists l where l.board_id = p_board and l.worker_id = w.id);
end $$;
grant execute on function schedule_portal.seed_board_columns(uuid, uuid) to authenticated, service_role;

-- ── (2) Service dictionary: raw activity → canonical service + label ─────────
create table if not exists schedule_portal.service_dictionary (
  id uuid primary key default gen_random_uuid(),
  match text not null,          -- case-insensitive substring of the raw activity
  canonical text not null,      -- standardized service name
  label_key text,               -- optional label to attach (from schedule_portal.labels)
  priority int not null default 0
);

insert into schedule_portal.service_dictionary (match, canonical, label_key, priority) values
  ('window', 'Windows', 'windows', 20),
  ('power wash', 'Power Wash', 'hpw', 20),
  ('pressure', 'Power Wash', 'hpw', 19),
  ('hpw', 'HPW', 'hpw', 20),
  ('janitor', 'Janitorial', 'janitorial', 18),
  ('model', 'Model Home Clean', 'model_home', 17),
  ('sign off', 'Final Clean', 'quality_inspection', 16),
  ('final touch', 'Final Touch Up', 'quality_inspection', 15),
  ('touch', 'Touch Up', 'quality_inspection', 12),
  ('final', 'Final Clean', 'quality_inspection', 11),
  ('deep clean', 'Deep Clean', 'residential', 10),
  ('rough', 'Rough Clean', 'residential', 9),
  ('drywall', 'Rough Clean', 'residential', 9),
  ('sweep', 'Rough Clean', 'residential', 9),
  ('initial', 'Initial Clean', 'residential', 8),
  ('1st', '1st Clean', 'residential', 7),
  ('first', '1st Clean', 'residential', 7),
  ('2nd', '2nd Clean', 'residential', 7),
  ('single clean', 'Single Clean', 'residential', 6),
  ('monthly', 'Monthly Clean', 'commercial', 6),
  ('verification', 'Verification Clean', 'quality_inspection', 6),
  ('acceptance', 'Mgmt Acceptance Clean', 'quality_inspection', 6),
  ('clean', 'Clean', null, 1)
on conflict do nothing;

create or replace function schedule_portal.dict_lookup(p_activity text, out canonical text, out label_key text)
language sql stable as $$
  select d.canonical, d.label_key
  from schedule_portal.service_dictionary d
  where p_activity is not null and lower(p_activity) like '%' || lower(d.match) || '%'
  order by d.priority desc, length(d.match) desc
  limit 1;
$$;

-- ── (3) Rewrite the mapper to use both ───────────────────────────────────────
create or replace function schedule_portal.map_imported_schedules(p_source text default null)
returns integer
language plpgsql security definer set search_path = schedule_portal as $$
declare
  r record;
  v_board uuid;
  v_list uuid;
  v_card uuid;
  v_service text;
  v_label text;
  n int := 0;
  wd  text[] := array['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  mon text[] := array['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
begin
  -- Pass A: map each unmapped, dated import into a card.
  for r in
    select * from schedule_portal.imported_schedules
    where mapped_card_id is null and scheduled_date is not null
      and (p_source is null or source = p_source)
    order by scheduled_date, community
  loop
    v_board := null;
    insert into schedule_portal.boards (organization_id, date, title, month, status)
    values (
      r.organization_id, r.scheduled_date,
      mon[extract(month from r.scheduled_date)::int] || '/' || to_char(r.scheduled_date, 'DD') || '/'
        || to_char(r.scheduled_date, 'YY') || ' · ' || wd[extract(dow from r.scheduled_date)::int + 1],
      to_char(r.scheduled_date, 'YYYY-MM'), 'open'
    )
    on conflict (organization_id, date) do nothing
    returning id into v_board;
    if v_board is null then
      select id into v_board from schedule_portal.boards where organization_id = r.organization_id and date = r.scheduled_date;
    end if;

    -- "Unassigned" list for imported (not-yet-assigned) services
    select id into v_list from schedule_portal.lists
      where board_id = v_board and name = 'Unassigned' and is_pool = false limit 1;
    if v_list is null then
      insert into schedule_portal.lists (organization_id, board_id, name, position, is_pool)
      values (r.organization_id, v_board, 'Unassigned',
              (select coalesce(max(position), -1) + 1 from schedule_portal.lists where board_id = v_board), false)
      returning id into v_list;
    end if;

    -- standardize the service via the dictionary
    select canonical, label_key into v_service, v_label from schedule_portal.dict_lookup(r.activity);
    if v_service is null then v_service := coalesce(nullif(r.service_type, ''), r.activity); end if;

    insert into schedule_portal.cards
      (organization_id, board_id, list_id, position, status,
       client_text, building, plan, lot, service_type, address, ps_note)
    values (
      r.organization_id, v_board, v_list,
      (select count(*) from schedule_portal.cards where list_id = v_list),
      'scheduled',
      coalesce(r.builder, r.community), r.community, r.plan, r.lot, v_service, r.address,
      nullif(concat_ws(' · ',
        case when r.super_name is not null then 'SUPER: ' || r.super_name || coalesce(' ' || r.super_phone, '') end,
        case when r.builder_order_no is not null then 'PO: ' || r.builder_order_no end,
        nullif(r.phase, ''),
        'SRC: ' || r.source), '')
    )
    returning id into v_card;

    -- labels: always "commercial" + the dictionary label
    insert into schedule_portal.card_labels (card_id, label_id)
    select v_card, l.id from schedule_portal.labels l
    where l.organization_id = r.organization_id and l.key in ('commercial', coalesce(v_label, 'commercial'))
    on conflict do nothing;

    update schedule_portal.imported_schedules set mapped_card_id = v_card where id = r.id;
    n := n + 1;
  end loop;

  -- Pass B: ensure every board that has imported cards carries the employee columns
  -- (covers boards mapped before this migration too).
  for r in
    select distinct b.id as bid, b.organization_id as oid
    from schedule_portal.boards b
    where exists (
      select 1 from schedule_portal.imported_schedules i
      where i.organization_id = b.organization_id and i.scheduled_date = b.date
        and (p_source is null or i.source = p_source))
  loop
    perform schedule_portal.seed_board_columns(r.bid, r.oid);
  end loop;

  return n;
end $$;
grant execute on function schedule_portal.map_imported_schedules(text) to authenticated, service_role;
