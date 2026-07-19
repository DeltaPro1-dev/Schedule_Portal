-- ============================================================================
-- Schedule_Portal — enable Supabase Realtime for the board surfaces
-- Implements the realtime half of events.md (card.*, list.created, board.updated).
--
-- Realtime delivers Postgres changes only for tables added to the
-- `supabase_realtime` publication. RLS still applies: a client only receives
-- change events for rows its SELECT policy already permits (org-scoped), so no
-- cross-org leakage. Run once in the SQL Editor (migrations 0001-0005 applied).
-- ============================================================================

-- Add our board tables to the realtime publication (idempotent).
do $$ begin
  alter publication supabase_realtime add table schedule_portal.cards;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table schedule_portal.lists;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table schedule_portal.boards;
exception when duplicate_object then null; end $$;

-- REPLICA IDENTITY FULL so UPDATE/DELETE events carry the full OLD row. Without
-- it the OLD tuple is only the primary key, and Realtime row-filters on
-- non-PK columns (e.g. board_id) can't be evaluated for those events.
alter table schedule_portal.cards replica identity full;
alter table schedule_portal.lists replica identity full;
