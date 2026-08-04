-- ============================================================================
-- Schedule_Portal — apply the PLACE dictionary during import (closes the gap
-- between the two dictionaries).
--
-- There are two complementary dictionaries:
--   * schedule_portal.service_dictionary (0015) — normalizes the raw activity
--     text into a canonical service name + label. Runs in SQL at import time.
--   * schedule_portal.dictionary (0013) — PLACE references: building /
--     subdivision / client / address → canonical builder, address, plan, lot,
--     service type, finance contact, PS note. Until now it only ran in the app
--     (JS addCard/updateCard), so cards created by map_imported_schedules()
--     — i.e. every imported card — were NOT completed.
--
-- This migration ports that completion to SQL and calls it from the mapper, so
-- imported cards are standardized (service) AND completed (place) on arrival.
--
-- Semantics mirror src/lib/dictionary.js exactly:
--   * fills ONLY empty card fields (never overwrites data that came in);
--   * most specific match wins: building > address > subdivision > client.
-- ============================================================================

-- ── (1) Apply place references to one card ───────────────────────────────────
create or replace function schedule_portal.apply_place_dictionary(p_card_id uuid)
returns boolean
language plpgsql security definer set search_path = schedule_portal as $$
declare
  c        schedule_portal.cards;
  v_client text;
  v        record;
begin
  select * into c from schedule_portal.cards where id = p_card_id;
  if not found then return false; end if;

  -- the card's effective client: free text, else the linked client's name
  v_client := coalesce(
    nullif(btrim(c.client_text), ''),
    (select nullif(btrim(cl.name), '') from schedule_portal.clients cl where cl.id = c.client_id)
  );

  -- winning value per field among the entries whose key matches this card
  with m as (
    select d.*,
           case d.match_field
             when 'building'    then 0
             when 'address'     then 1
             when 'subdivision' then 2
             when 'client'      then 3
             else 9
           end as spec
    from schedule_portal.dictionary d
    where d.organization_id = c.organization_id
      and d.deleted_at is null
      and (
           (d.match_field = 'building'
              and btrim(coalesce(c.building, '')) <> ''
              and lower(btrim(d.match_value)) = lower(btrim(c.building)))
        or (d.match_field = 'address'
              and btrim(coalesce(c.address, '')) <> ''
              and lower(btrim(d.match_value)) = lower(btrim(c.address)))
        or (d.match_field = 'subdivision'
              and btrim(coalesce(c.subdivision, '')) <> ''
              and lower(btrim(d.match_value)) = lower(btrim(c.subdivision)))
        or (d.match_field = 'client'
              and btrim(coalesce(v_client, '')) <> ''
              and lower(btrim(d.match_value)) = lower(btrim(v_client)))
      )
  )
  select
    (select client_text  from m where client_text  is not null order by spec limit 1) as client_text,
    (select address      from m where address      is not null order by spec limit 1) as address,
    (select subdivision  from m where subdivision  is not null order by spec limit 1) as subdivision,
    (select plan         from m where plan         is not null order by spec limit 1) as plan,
    (select lot          from m where lot          is not null order by spec limit 1) as lot,
    (select service_type from m where service_type is not null order by spec limit 1) as service_type,
    (select fin_contact  from m where fin_contact  is not null order by spec limit 1) as fin_contact,
    (select ps_note      from m where ps_note      is not null order by spec limit 1) as ps_note
  into v;

  if v is null then return false; end if;

  update schedule_portal.cards set
    client_text  = case when btrim(coalesce(v_client, ''))       = '' then coalesce(v.client_text,  client_text)  else client_text  end,
    address      = case when btrim(coalesce(address, ''))        = '' then coalesce(v.address,      address)      else address      end,
    subdivision  = case when btrim(coalesce(subdivision, ''))    = '' then coalesce(v.subdivision,  subdivision)  else subdivision  end,
    plan         = case when btrim(coalesce(plan, ''))           = '' then coalesce(v.plan,         plan)         else plan         end,
    lot          = case when btrim(coalesce(lot, ''))            = '' then coalesce(v.lot,          lot)          else lot          end,
    service_type = case when btrim(coalesce(service_type, ''))   = '' then coalesce(v.service_type, service_type) else service_type end,
    fin_contact  = case when btrim(coalesce(fin_contact, ''))    = '' then coalesce(v.fin_contact,  fin_contact)  else fin_contact  end,
    ps_note      = case when btrim(coalesce(ps_note, ''))        = '' then coalesce(v.ps_note,      ps_note)      else ps_note      end,
    updated_at   = now()
  where id = p_card_id
    -- only write when at least one empty field actually gets a value
    and (
         (btrim(coalesce(v_client, ''))     = '' and v.client_text  is not null)
      or (btrim(coalesce(address, ''))      = '' and v.address      is not null)
      or (btrim(coalesce(subdivision, ''))  = '' and v.subdivision  is not null)
      or (btrim(coalesce(plan, ''))         = '' and v.plan         is not null)
      or (btrim(coalesce(lot, ''))          = '' and v.lot          is not null)
      or (btrim(coalesce(service_type, '')) = '' and v.service_type is not null)
      or (btrim(coalesce(fin_contact, ''))  = '' and v.fin_contact  is not null)
      or (btrim(coalesce(ps_note, ''))      = '' and v.ps_note      is not null)
    );

  return found;
end $$;
grant execute on function schedule_portal.apply_place_dictionary(uuid) to authenticated, service_role;

-- ── (2) Batch: complete a whole board (or the caller's whole org) ─────────────
-- Returns how many cards were completed. Handy after an import, or from the app.
create or replace function schedule_portal.apply_place_dictionary_all(p_board uuid default null)
returns integer
language plpgsql security definer set search_path = schedule_portal as $$
declare r record; n int := 0;
begin
  for r in
    select id from schedule_portal.cards
    where deleted_at is null
      and (p_board is null or board_id = p_board)
      and organization_id = coalesce(schedule_portal.my_org(), organization_id)
  loop
    if schedule_portal.apply_place_dictionary(r.id) then n := n + 1; end if;
  end loop;
  return n;
end $$;
grant execute on function schedule_portal.apply_place_dictionary_all(uuid) to authenticated, service_role;

-- ── (3) Hook it into the import mapper ───────────────────────────────────────
-- Same body as 0015 (service dictionary + board column seeding) with ONE added
-- step: after the card and its labels exist, complete it from the place
-- dictionary. Pass B (employee columns) is unchanged.
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

    -- NEW: complete whatever the portal didn't send, from the place dictionary
    perform schedule_portal.apply_place_dictionary(v_card);

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
