# Máquina de Estados do Serviço (Card)
`cards.status`. Transições válidas por perfil. Toda transição gera AuditEvent (verb MOVE/UPDATE/COMPLETE).

## Estados
`unscheduled` → `scheduled` → `assigned` → `in_progress` → `completed` → `invoiced` → `paid`
Ramos: `on_hold` (pausa), `rework` (reprovado na inspeção), `cancelled`.

## Transições permitidas
| De | Para | Quem |
|---|---|---|
| unscheduled | scheduled | coordinator, supervisor |
| scheduled | assigned | coordinator, supervisor |
| assigned | in_progress | operator (próprio), supervisor |
| in_progress | on_hold | operator, supervisor |
| on_hold | in_progress | operator, supervisor |
| in_progress | completed | operator (próprio), supervisor |
| completed | rework | supervisor, coordinator |
| rework | in_progress | operator, supervisor |
| completed | invoiced | finance |
| invoiced | paid | finance |
| (qualquer, exceto paid) | cancelled | coordinator |

Notas:
- Mover um card entre listas (workers) NÃO muda o status; muda `list_id`/`position` e emite `card.moved`.
- `done=true` mapeia para `completed` no MVP (checkbox do card). Estados de faturamento (`invoiced/paid`) são governança pós-conclusão.
- `paid` é terminal.
