# Permissions Matrix (RBAC)
Enforced on the backend (route guards + region scope). The front-end mirrors it only to hide/disable UI — never as the sole barrier.

## Access levels (per worker / membership)
| Level | Cards | Workers / Boards | Notes |
|---|---|---|---|
| **admin** | create / edit / **delete** | add / **delete** workers, boards; manage members | full control |
| **editor** | create / edit / correct | — | **cannot delete** anything |
| **none** | view only | view only | default for new & imported workers |

## Module × role (finer detail)
Levels: **full** · **region** (own region only) · **assigned** (own items only) · **view** · **none**.

| Module | Coordinator | Supervisor | Operator | Finance | Viewer |
|---|---|---|---|---|---|
| Boards & Cards | full | region | assigned | view | view |
| Schedule / allocation | full | region | view | view | view |
| Exports | full | region | none | full | none |
| Audit | full | region | none | view | none |
| Integrations | full | none | none | view | none |
| Members & RBAC | full | none | none | none | none |

**Admin** role = full everywhere including org settings.

## Scope rules
- `region`: supervisor sees/edits only boards/lists/cards in their membership region.
- `assigned`: operator edits only cards on their own worker list (mark done, comment, move within the day).
- `editor` access can edit/correct but the **Delete** action is hidden and rejected server-side (403).
- Every denial → `403` `error.code=FORBIDDEN` and an audit entry.
