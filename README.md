# Contrato Compartilhado — Portal Operacional Delta
Fonte única de verdade para Front-end (Claude Design) e Back-end (Claude Code).
Versão: v1 · Congelado no Gate G0.

## Stack recomendada
- **Back-end:** NestJS (Node.js/TypeScript), arquitetura modular (um módulo por domínio).
- **Banco:** PostgreSQL (migrations versionadas). Multi-tenant por `organization_id`.
- **Cache/fila:** Redis + BullMQ (exports assíncronos e fila de integração).
- **Realtime:** WebSocket (Socket.IO ou gateway nativo do NestJS) + fallback de polling.
- **Storage:** S3-compatível (anexos, com antivírus + thumbnails).
- **Contrato como código:** `openapi.yaml` → `openapi-typescript` gera os tipos do front → MSW gera mocks. O mesmo arquivo valida as respostas nos testes de contrato.

## Modelo mental do produto (Trello-like)
- **Board = um dia de operação** (ex.: JUL/16/26 · THURSDAY).
- **List (coluna) = um trabalhador ou prestador** (funcionário CLT, autônomo ou empresa terceirizada). A primeira lista, *DELTA OFFICE / WAREHOUSE*, é o pool de recursos disponíveis.
- **Card = um serviço agendado** para aquele trabalhador naquele dia (título estruturado, labels, membro, checklist, comentários, anexos).
- **Regiões:** North, South, St George (e "Another State" para fora da área).

## Convenções da API
- Base: `/api/v1`. JSON em UTF-8. Datas em ISO-8601 (UTC).
- Auth: `Authorization: Bearer <access_token>`. 2FA (TOTP) opcional por usuário.
- Toda mutação relevante gera um **AuditEvent** (interceptor global, desde o dia 1).
- Concorrência otimista: campo `version` em Card/List/Board; conflito → **409** com o objeto do servidor para o front exibir diff.
- Paginação: `?page=1&pageSize=50` (máx 200). Resposta inclui `{ data, page, pageSize, total }`.
- Idempotência de escrita: header `Idempotency-Key` (usado também pela integração Field Control).
- Erros: envelope `{ error: { code, message, details? } }` com códigos estáveis (ver openapi.yaml).

## Artefatos deste contrato
| Arquivo | Conteúdo |
|---|---|
| `glossary.md` | Nomes canônicos (Board, List, Card, Region, Label…). |
| `data-model.md` | Entidades, campos e relacionamentos (ER). |
| `permissions-matrix.md` | Perfil × módulo × operação (RBAC). |
| `events.md` | Catálogo de eventos WebSocket, notificações e audit. |
| `service-state-machine.md` | Ciclo de vida do serviço (card). |
| `openapi.yaml` | Contrato de API (OpenAPI 3.1). |

## Regra de ouro
Nenhum agente implementa algo fora deste contrato. Se faltar, abre-se uma proposta de mudança de contrato (aprovação humana → incremento de versão → regeneração de tipos/mocks/testes → registro no Decision Log).
