-- ============================================================================
-- Schedule_Portal — superintendent (site contact) captured from each SupplyPro
-- OrderDetail's Shipping Information "Contact Information" block.
-- ============================================================================
alter table schedule_portal.imported_schedules
  add column if not exists super_name text,
  add column if not exists super_phone text,
  add column if not exists super_email text;
