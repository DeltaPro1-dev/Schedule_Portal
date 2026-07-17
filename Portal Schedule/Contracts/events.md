# Catálogo de Eventos

## WebSocket (namespace /realtime, sala por organization + board)
| Evento | Payload | Emitido quando |
|---|---|---|
| `card.created` | { card } | Card criado |
| `card.updated` | { card } | Campos do card alterados |
| `card.moved` | { cardId, fromListId, toListId, position } | Card movido entre listas |
| `card.completed` | { cardId, done } | Checkbox de conclusão |
| `list.created` | { list } | Lista/worker adicionado ao board |
| `board.updated` | { board } | Status/star/título do board |
| `presence.update` | { boardId, users:[{id,name,initials}] } | Entrada/saída de usuários no board |
| `conflict` | { entity, serverVersion, serverObject } | Escrita rejeitada por versão (409) |

Regras: cada mutação REST emite o evento correspondente para os demais clientes da sala. Optimistic update no front é confirmado ou revertido pelo evento/erro.

## Notificações (in-app + e-mail)
| Chave | Gatilho | Destino |
|---|---|---|
| `assignment.new` | Card atribuído a um worker | Operator do worker |
| `service.completed` | Card concluído | Supervisor da região |
| `export.ready` | Export finalizado | Quem solicitou |
| `integration.dlq` | Evento caiu na DLQ | Coordinator + Admin |

## Audit events (verbos)
`LOGIN, CREATE, UPDATE, MOVE, COMPLETE, EXPORT, DELETE, REPROCESS` — ver `data-model.md > audit_events`. Imutáveis, retenção mínima 2 anos.
