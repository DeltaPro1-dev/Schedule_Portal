-- ============================================================================
-- Schedule_Portal — extra fields captured from each SupplyPro OrderDetail page
-- (builder already exists on imported_schedules; add the rest).
-- ============================================================================
alter table schedule_portal.imported_schedules
  add column if not exists subdivision text,
  add column if not exists phase text,
  add column if not exists plan text,
  add column if not exists elevation text,
  add column if not exists swing text,
  add column if not exists block text,
  add column if not exists job_start_date date,
  add column if not exists builder_order_no text;
