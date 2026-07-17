-- ============================================================================
-- Schedule_Portal — Storage bucket for card attachments
-- Bucket names are GLOBAL to the project; ours is namespaced 'schedule-attachments'
-- (Expense Portal uses 'receipts', Check List App its own). Path: <card_id>/<file>.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('schedule-attachments', 'schedule-attachments', false)
on conflict (id) do nothing;

-- Any active member may read attachments in the bucket.
drop policy if exists "schedule attachments read" on storage.objects;
create policy "schedule attachments read" on storage.objects
  for select to authenticated
  using (bucket_id = 'schedule-attachments' and schedule_portal.is_member());

-- Editors+ may upload / update.
drop policy if exists "schedule attachments write" on storage.objects;
create policy "schedule attachments write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'schedule-attachments' and schedule_portal.can_edit());

drop policy if exists "schedule attachments update" on storage.objects;
create policy "schedule attachments update" on storage.objects
  for update to authenticated
  using (bucket_id = 'schedule-attachments' and schedule_portal.can_edit());

-- Admins may delete.
drop policy if exists "schedule attachments delete" on storage.objects;
create policy "schedule attachments delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'schedule-attachments' and schedule_portal.is_admin());
