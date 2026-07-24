-- ============================================================================
-- Schedule_Portal — map imported_schedules → boards/cards.
-- Each imported service becomes a card on the board for its scheduled_date, in an
-- "Unassigned" list (builder-scheduled, not yet assigned to a Delta worker — the
-- coordinator moves it to a worker column). Idempotent via mapped_card_id.
-- Call: select schedule_portal.map_imported_schedules();            -- all sources
--       select schedule_portal.map_imported_schedules('supplypro'); -- one source
-- ============================================================================
create or replace function schedule_portal.map_imported_schedules(p_source text default null)
returns integer
language plpgsql security definer set search_path = schedule_portal as $$
declare
  r record;
  v_board uuid;
  v_list uuid;
  v_card uuid;
  n int := 0;
  wd  text[] := array['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  mon text[] := array['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
begin
  for r in
    select * from schedule_portal.imported_schedules
    where mapped_card_id is null and scheduled_date is not null
      and (p_source is null or source = p_source)
    order by scheduled_date, community
  loop
    -- board for the day (one per operating day)
    insert into schedule_portal.boards (organization_id, date, title, month, status)
    values (
      r.organization_id, r.scheduled_date,
      mon[extract(month from r.scheduled_date)::int] || '/' || to_char(r.scheduled_date, 'DD') || '/'
        || to_char(r.scheduled_date, 'YY') || ' · ' || wd[extract(dow from r.scheduled_date)::int + 1],
      to_char(r.scheduled_date, 'YYYY-MM'), 'open'
    )
    on conflict (organization_id, date) do nothing;
    select id into v_board from schedule_portal.boards
      where organization_id = r.organization_id and date = r.scheduled_date;

    -- "Unassigned" list on that board (holds imported, not-yet-assigned services)
    select id into v_list from schedule_portal.lists
      where board_id = v_board and name = 'Unassigned' and is_pool = false limit 1;
    if v_list is null then
      insert into schedule_portal.lists (organization_id, board_id, name, position, is_pool)
      values (r.organization_id, v_board, 'Unassigned',
              (select coalesce(max(position), -1) + 1 from schedule_portal.lists where board_id = v_board), false)
      returning id into v_list;
    end if;

    -- the card (structured from the imported fields)
    insert into schedule_portal.cards
      (organization_id, board_id, list_id, position, status,
       client_text, building, plan, lot, service_type, address, ps_note)
    values (
      r.organization_id, v_board, v_list,
      (select count(*) from schedule_portal.cards where list_id = v_list),
      'scheduled',
      coalesce(r.builder, r.community), r.community, r.plan, r.lot, r.service_type, r.address,
      nullif(concat_ws(' · ',
        case when r.super_name is not null then 'SUPER: ' || r.super_name || coalesce(' ' || r.super_phone, '') end,
        case when r.builder_order_no is not null then 'PO: ' || r.builder_order_no end,
        nullif(r.phase, ''),
        'SRC: ' || r.source), '')
    )
    returning id into v_card;

    update schedule_portal.imported_schedules set mapped_card_id = v_card where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function schedule_portal.map_imported_schedules(text) to authenticated, service_role;
