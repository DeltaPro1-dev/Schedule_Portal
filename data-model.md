# Data Model
PostgreSQL. All tables: `id` (uuid), `organization_id`, `created_at`, `updated_at`. Soft delete via `deleted_at` where noted. Optimistic concurrency via `version` (int) on boards/lists/cards.

## ER (textual)
```
Organization 1─* Membership *─1 User
Organization 1─* Worker
Organization 1─* Client
Organization 1─* Board 1─* List *─1 Worker
                         List 1─* Card *─1 Client
Card *─* Label   Card 1─* ChecklistItem   Card 1─* Comment   Card 1─* Attachment
Organization 1─* AuditEvent | Export | IntegrationEvent
```

## Tables

### organizations
`id, name, slug, created_at`

### users
`id, email (unique), password_hash, name, mfa_secret?, mfa_enabled, failed_attempts, locked_until?, last_login_at?, created_at`

### memberships
`id, organization_id, user_id, role (enum), region (enum|all), access (admin|editor|none), status (active|invited|disabled), invited_email?, worker_id?, created_at`
- `role`: admin | coordinator | supervisor | operator | finance | viewer
- `region`: north | south | st_george | another | all
- `access`: admin | editor | none  (default `none`)
- `worker_id` (D6, migration 0010): links the membership to its `workers` row —
  gives operators the exact "assigned" scope (only their own list). Nullable;
  unique where set (one login per worker). Unlinked operators fall back to region
  scope (safe superset).

### workers  (roster — base for board generation)
`id, organization_id, kind (employee|contractor|company), name, initials, region, access (admin|editor|none default none), active, position, created_at, deleted_at?`

### clients
`id, organization_id, name, address?, fin_contact?, notes?, created_at, deleted_at?`

### boards  (one per day)
`id, organization_id, date (date, unique per org), title, month (char(7) e.g. '2026-07'), cover_hue?, status (open|closed), starred, version, created_at`
- Boards whose `month` < current month are `status=closed` and grouped under the month in the UI.

### lists  (column = worker; or pool)
`id, organization_id, board_id, worker_id? (null = DELTA OFFICE pool), name, position, is_pool, version, created_at`

### cards  (service)
`id, organization_id, board_id, list_id, position, status (see service-state-machine.md),
 scheduled_time?, client_id?, client_text?, building?, plan?, lot?, service_type?, address?, fin_contact?, ps_note?,
 raw_title?, done (bool), version, created_at, updated_at, deleted_at?`
- Index: (board_id, list_id, position), (organization_id, status).

### labels / card_labels
`labels: id, organization_id, key, name, color, kind (region|type|schedule)`
Seeds (15): model_home, office, residential, st_george, floor_care, south, scheduled_time, north, another_state, janitorial, windows, quality_inspection, commercial, hpw, emergency.
`card_labels: card_id, label_id`

### checklist_items / comments / attachments
`checklist_items: id, card_id, text, done, position`
`comments: id, card_id, user_id, body, created_at`
`attachments: id, card_id, uploaded_by, filename, mime, size, s3_key, thumb_key?, scan_status (pending|clean|infected)`

### audit_events  (immutable)
`id, organization_id, actor_user_id?, actor_kind (user|system), verb, entity_type, entity_id?, scope?, detail, ip?, created_at`
- verb: LOGIN | CREATE | UPDATE | MOVE | COMPLETE | EXPORT | DELETE | REPROCESS

### exports
`id, organization_id, requested_by, report_type, format (csv|xlsx|pdf|json), params_json, status (queued|processing|done|failed), row_count?, file_key?, created_at, finished_at?`

### integration_events  (Field Control queue)
`id, organization_id, direction (push|pull), entity_type, entity_id?, idempotency_key (unique), payload_json, status (queued|retrying|done|dlq), attempts, max_attempts, last_error?, next_retry_at?, created_at, updated_at`
