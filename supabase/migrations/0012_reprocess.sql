-- Schedule_Portal — manual reprocessing of integration events (G6 groundwork)
-- STATUS: ready to deploy — NOT yet applied. Additive only.
-- The integration_events queue is service-role-only for writes; this RPC lets an
-- admin/coordinator re-queue a failed/retrying event from the Integration Monitor.
-- Inert until Field Control feeds the queue (decision D8), but wires the button.

create or replace function schedule_portal.reprocess_integration(p_id uuid)
returns schedule_portal.integration_events
language plpgsql security definer set search_path = schedule_portal as $$
declare v_row schedule_portal.integration_events;
begin
  if schedule_portal.my_role() not in ('admin', 'coordinator') then
    raise exception 'forbidden' using detail = 'integrations require admin/coordinator';
  end if;

  update schedule_portal.integration_events
     set status = 'queued',
         attempts = 0,
         last_error = null,
         next_retry_at = now(),
         updated_at = now()
   where id = p_id
     and organization_id = schedule_portal.my_org()
     and status in ('retrying', 'dlq')
  returning * into v_row;

  if not found then raise exception 'not_found_or_not_reprocessable'; end if;

  insert into schedule_portal.audit_events
    (organization_id, actor_user_id, verb, entity_type, entity_id, detail)
  values (v_row.organization_id, auth.uid(), 'REPROCESS', 'integration_event', v_row.id,
          jsonb_build_object('idempotency_key', v_row.idempotency_key));

  return v_row;
end;
$$;

grant execute on function schedule_portal.reprocess_integration(uuid) to authenticated;
