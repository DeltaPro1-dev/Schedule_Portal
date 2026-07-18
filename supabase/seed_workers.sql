-- ============================================================================
-- Schedule_Portal — starter roster (workers). Run ONCE in the SQL Editor.
-- These employees become one board column each when a new board is created;
-- the companies show up as vendors in the DELTA OFFICE / WAREHOUSE pool.
-- Manage the roster afterwards in the app's Employees screen.
-- ============================================================================
do $$
declare v_org uuid;
begin
  select id into v_org from schedule_portal.organizations where slug = 'delta-pro-clean';
  if v_org is null then raise exception 'org delta-pro-clean not found'; end if;

  if not exists (select 1 from schedule_portal.workers where organization_id = v_org) then
    insert into schedule_portal.workers (organization_id, name, initials, region, kind, active) values
      -- employees (one board column each)
      (v_org,'Furbert, Tariq','FT','st_george','employee',true),
      (v_org,'Gutierrez Bautista, Chloe','GB','south','employee',true),
      (v_org,'Tucker, Chloe','TC','st_george','employee',true),
      (v_org,'Burgess, Carla','BC','north','employee',true),
      (v_org,'Vidal Canova, Reinaldo','VR','south','employee',true),
      (v_org,'Lopez Restrepo, Isabel','LI','north','employee',true),
      (v_org,'da Cunha, Luanna','CL','st_george','employee',true),
      (v_org,'Barrote, Ricardo','BR','south','employee',true),
      (v_org,'Gomez, Andrea','GA','north','employee',true),
      (v_org,'Bascome, Hannah','BH','north','employee',true),
      (v_org,'Santos, Jose','SJ','south','employee',true),
      (v_org,'Fernandes, Luciana','FL','north','employee',true),
      (v_org,'Silva, Maria','SM','st_george','employee',true),
      (v_org,'Costa, Diego','CD','south','employee',true),
      (v_org,'Oliveira, Camila','OC','north','employee',true),
      (v_org,'Reis, Mateo','RM','st_george','employee',true),
      (v_org,'Nunes, Sofia','NS','south','employee',true),
      (v_org,'Braga, Miguel','BM','north','employee',true),
      (v_org,'Rocha, Beatriz','RB','st_george','employee',true),
      (v_org,'Bortoloni, Vanessa','BV','south','employee',true),
      -- companies / contractors (pool vendors)
      (v_org,'Shine In Cleaning LLC','SC','all','company',true),
      (v_org,'R&V Professional Services','RV','all','company',true),
      (v_org,'WGJ Services','WG','all','company',true),
      (v_org,'Ultra Cleaning','UC','all','company',true),
      (v_org,'Bright Path Cleaning LLC','BP','all','company',true),
      (v_org,'BH Cleaning LLC','BH','all','company',true),
      (v_org,'Gray Star Cleaning LLC','GS','all','company',true);
    raise notice 'Roster seeded.';
  else
    raise notice 'Workers already exist — skipped.';
  end if;
end $$;
