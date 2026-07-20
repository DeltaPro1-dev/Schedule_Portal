-- Schedule_Portal — async export worker support (G2)
-- Small exports (CSV/JSON) run client-side and are logged via the existing
-- exports_insert RLS policy. This migration adds the pieces the ASYNC worker needs
-- for large / scheduled / XLSX / PDF exports:
--   1. a private storage bucket for generated files
--   2. member read access to their own org's files (worker writes via service role)
--   3. request_export() to enqueue a job (status = 'queued')
-- The worker itself is supabase/functions/export-worker (deploy separately).

-- 1. Private bucket ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('schedule-exports', 'schedule-exports', false)
on conflict (id) do nothing;

-- 2. Storage policies --------------------------------------------------------
-- Files are keyed <organization_id>/<export_id>.<ext>. A member may read files
-- under their own org's folder. Writes/updates/deletes are done by the worker
-- with the service-role key, which bypasses RLS — no authenticated write policy.
drop policy if exists exports_files_read on storage.objects;
create policy exports_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'schedule-exports'
    and schedule_portal.is_member()
    and (storage.foldername(name))[1] = schedule_portal.my_org()::text
  );

-- 3. Enqueue RPC -------------------------------------------------------------
-- Security invoker: relies on the exports_insert policy (requested_by = auth.uid,
-- organization_id = my_org). Returns the queued row so the UI can track it.
create or replace function schedule_portal.request_export(
  p_report_type text,
  p_format text,
  p_params jsonb default '{}'::jsonb
) returns schedule_portal.exports
language plpgsql
as $$
declare
  v_row schedule_portal.exports;
begin
  if p_format not in ('csv', 'xlsx', 'pdf', 'json') then
    raise exception 'unsupported format: %', p_format;
  end if;
  insert into schedule_portal.exports (organization_id, requested_by, report_type, format, params_json, status)
  values (schedule_portal.my_org(), auth.uid(), p_report_type, p_format::schedule_portal.export_format, coalesce(p_params, '{}'::jsonb), 'queued')
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function schedule_portal.request_export(text, text, jsonb) to authenticated;
