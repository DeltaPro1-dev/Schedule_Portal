-- ============================================================================
-- Portal Operacional Delta (Schedule_Portal) — core schema
-- Contract: data-model.md (G0), execution pivot G1 (see DECISIONS.md).
--
-- ALL objects live in the dedicated schema `schedule_portal`. This Supabase
-- project (sryywirmhohrdsssujwf) is SHARED with the Check List App (prod, 199
-- users), the Expense Portal and the sheets sync. We never touch public.* or
-- global functions — the isolated schema is our namespace.
-- ============================================================================

create schema if not exists schedule_portal;

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type schedule_portal.role      as enum ('admin','coordinator','supervisor','operator','finance','viewer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.region    as enum ('north','south','st_george','another','all');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.access    as enum ('admin','editor','none');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.worker_kind as enum ('employee','contractor','company');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.member_status as enum ('active','invited','disabled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.board_status as enum ('open','closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.card_status as enum
    ('unscheduled','scheduled','assigned','in_progress','on_hold','completed','rework','invoiced','paid','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.label_kind as enum ('region','type','schedule');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.scan_status as enum ('pending','clean','infected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.export_status as enum ('queued','processing','done','failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.export_format as enum ('csv','xlsx','pdf','json');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.integration_status as enum ('queued','retrying','done','dlq');
exception when duplicate_object then null; end $$;
do $$ begin
  create type schedule_portal.integration_direction as enum ('push','pull');
exception when duplicate_object then null; end $$;

-- ── Organizations (tenant) ───────────────────────────────────────────────────
create table if not exists schedule_portal.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

-- ── Memberships (auth.users ↔ org, with role/region/access) ──────────────────
-- G1: replaces G0 `users` table. Identity/2FA/lockout handled by Supabase Auth.
create table if not exists schedule_portal.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,     -- null while invited
  role schedule_portal.role not null default 'viewer',
  region schedule_portal.region not null default 'all',
  access schedule_portal.access not null default 'none',
  status schedule_portal.member_status not null default 'invited',
  invited_email text,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists memberships_user_idx on schedule_portal.memberships(user_id);
create index if not exists memberships_invited_email_idx on schedule_portal.memberships(lower(invited_email));

-- ── Workers (roster — base for board columns) ────────────────────────────────
create table if not exists schedule_portal.workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  kind schedule_portal.worker_kind not null default 'employee',
  name text not null,
  initials text,
  region schedule_portal.region not null default 'all',
  access schedule_portal.access not null default 'none',
  active boolean not null default true,
  position numeric not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists workers_org_idx on schedule_portal.workers(organization_id);

-- ── Clients ──────────────────────────────────────────────────────────────────
create table if not exists schedule_portal.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  name text not null,
  address text,
  fin_contact text,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists clients_org_idx on schedule_portal.clients(organization_id);

-- ── Boards (one per operating day) ───────────────────────────────────────────
create table if not exists schedule_portal.boards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  date date not null,
  title text not null,
  month char(7) not null,                                        -- e.g. '2026-07'
  cover_hue int,
  status schedule_portal.board_status not null default 'open',
  starred boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  unique (organization_id, date)
);
create index if not exists boards_month_idx on schedule_portal.boards(organization_id, month);

-- ── Lists (column = worker, or the DELTA OFFICE pool) ────────────────────────
create table if not exists schedule_portal.lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  board_id uuid not null references schedule_portal.boards(id) on delete cascade,
  worker_id uuid references schedule_portal.workers(id) on delete set null,  -- null = pool
  name text not null,
  position numeric not null default 0,
  is_pool boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists lists_board_idx on schedule_portal.lists(board_id, position);

-- ── Cards (a scheduled service) ──────────────────────────────────────────────
create table if not exists schedule_portal.cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  board_id uuid not null references schedule_portal.boards(id) on delete cascade,
  list_id uuid not null references schedule_portal.lists(id) on delete cascade,
  position numeric not null default 0,
  status schedule_portal.card_status not null default 'unscheduled',
  scheduled_time text,
  client_id uuid references schedule_portal.clients(id) on delete set null,
  client_text text,
  building text,
  plan text,
  lot text,
  service_type text,                                             -- CML/T&M/Monthly/Extra
  address text,
  fin_contact text,
  ps_note text,
  raw_title text,                                                -- free text for manual cards
  done boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists cards_list_pos_idx on schedule_portal.cards(board_id, list_id, position);
create index if not exists cards_status_idx on schedule_portal.cards(organization_id, status);

-- ── Labels / card_labels ─────────────────────────────────────────────────────
create table if not exists schedule_portal.labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  color text,
  kind schedule_portal.label_kind not null,
  unique (organization_id, key)
);

create table if not exists schedule_portal.card_labels (
  card_id uuid not null references schedule_portal.cards(id) on delete cascade,
  label_id uuid not null references schedule_portal.labels(id) on delete cascade,
  primary key (card_id, label_id)
);

-- ── Checklist / comments / attachments ───────────────────────────────────────
create table if not exists schedule_portal.checklist_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references schedule_portal.cards(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  position numeric not null default 0
);
create index if not exists checklist_card_idx on schedule_portal.checklist_items(card_id, position);

create table if not exists schedule_portal.comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references schedule_portal.cards(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_card_idx on schedule_portal.comments(card_id);

create table if not exists schedule_portal.attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references schedule_portal.cards(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  filename text not null,
  mime text,
  size bigint,
  s3_key text not null,                                          -- Supabase Storage object path
  thumb_key text,
  scan_status schedule_portal.scan_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists attachments_card_idx on schedule_portal.attachments(card_id);

-- ── Audit events (immutable) ─────────────────────────────────────────────────
create table if not exists schedule_portal.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind text not null default 'user' check (actor_kind in ('user','system')),
  verb text not null check (verb in ('LOGIN','CREATE','UPDATE','MOVE','COMPLETE','EXPORT','DELETE','REPROCESS')),
  entity_type text,
  entity_id uuid,
  scope text,
  detail jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists audit_org_created_idx on schedule_portal.audit_events(organization_id, created_at desc);

-- ── Exports (async jobs) ─────────────────────────────────────────────────────
create table if not exists schedule_portal.exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  report_type text not null,
  format schedule_portal.export_format not null,
  params_json jsonb,
  status schedule_portal.export_status not null default 'queued',
  row_count int,
  file_key text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ── Integration events (Field Control queue) ────────────────────────────────
create table if not exists schedule_portal.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references schedule_portal.organizations(id) on delete cascade,
  direction schedule_portal.integration_direction not null,
  entity_type text,
  entity_id uuid,
  idempotency_key text not null unique,
  payload_json jsonb,
  status schedule_portal.integration_status not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists integration_status_idx on schedule_portal.integration_events(organization_id, status);

-- ── updated_at maintenance (schema-scoped; no collision risk) ────────────────
create or replace function schedule_portal.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists cards_set_updated_at on schedule_portal.cards;
create trigger cards_set_updated_at before update on schedule_portal.cards
  for each row execute function schedule_portal.set_updated_at();

drop trigger if exists integration_set_updated_at on schedule_portal.integration_events;
create trigger integration_set_updated_at before update on schedule_portal.integration_events
  for each row execute function schedule_portal.set_updated_at();

-- ── Seed: the single org + the 15 canonical labels ───────────────────────────
insert into schedule_portal.organizations (name, slug)
values ('Delta Pro Clean', 'delta-pro-clean')
on conflict (slug) do nothing;

do $$
declare v_org uuid;
begin
  select id into v_org from schedule_portal.organizations where slug = 'delta-pro-clean';

  insert into schedule_portal.labels (organization_id, key, name, color, kind) values
    (v_org,'model_home','Model Home',        '#4CAF50','type'),
    (v_org,'office','Office',                 '#607D8B','type'),
    (v_org,'residential','Residential',       '#8BC34A','type'),
    (v_org,'st_george','St George',           '#FF9800','region'),
    (v_org,'floor_care','Floor Care',         '#795548','type'),
    (v_org,'south','South',                   '#2196F3','region'),
    (v_org,'scheduled_time','Scheduled Time', '#9C27B0','schedule'),
    (v_org,'north','North',                   '#3F51B5','region'),
    (v_org,'another_state','Another State',   '#9E9E9E','region'),
    (v_org,'janitorial','Janitorial',         '#00BCD4','type'),
    (v_org,'windows','Windows',               '#03A9F4','type'),
    (v_org,'quality_inspection','Quality Inspection','#F44336','type'),
    (v_org,'commercial','Commercial',         '#009688','type'),
    (v_org,'hpw','HPW',                       '#673AB7','type'),
    (v_org,'emergency','Emergency',           '#E91E63','type')
  on conflict (organization_id, key) do nothing;
end $$;
