# Glossary & Naming
Identical names in UI, API and DB. English in code; PT-BR only in presentation.

| Term | Definition | API / table |
|---|---|---|
| Organization | Tenant (Delta Pro Clean). | `organizations` |
| User | Person who can log in. | `users` |
| Membership | User↔Org link with role + region + access level. | `memberships` |
| AccessLevel | admin \| editor \| none. Governs card/board editing. | `memberships.access`, `workers.access` |
| Region | north \| south \| st_george \| another. | enum `region` |
| Worker | Employee, contractor or company. Becomes a **List** on a day board. | `workers` |
| Board | One operating day. Belongs to a month; archived when month closes. | `boards` |
| List | Board column = a Worker (or the DELTA OFFICE pool). | `lists` |
| Card | A scheduled service inside a List. | `cards` |
| Client | Final client served (e.g. KIA Findlay). | `clients` |
| Label | Card tag (region / type / schedule). 15 seed labels. | `labels` |
| ChecklistItem | Execution step of a service. | `checklist_items` |
| Comment / Attachment | On a card (attachments in S3). | `comments`, `attachments` |
| AuditEvent | Immutable action record. | `audit_events` |
| Export | Async export job (CSV/XLSX/PDF/JSON). | `exports` |
| IntegrationEvent | Field Control sync queue item. | `integration_events` |

## Card title (structured briefing)
Example:
`SCHEDULED AT 7am — Okland Construction · St. George Hospital Bldg 1 · No Plan · No Lot · Single Clean CML (T&M) · (1380 E Medical Center Dr, St. George, UT 84790) · FIN: ROBERT · PS: ...`

Derived fields: `scheduled_time, client, building, plan, lot, service_type (CML/T&M/Monthly/Extra), address, fin_contact, ps_note`. Manually-created cards use `raw_title` (free text).
