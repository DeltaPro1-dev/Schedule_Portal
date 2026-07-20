# Plano Mestre — Portal Operacional Delta (Schedule Portal)

> **Documento de planejamento consolidado.** Reúne o que já foi construído (Gates
> G0 → G1.6) com o que falta para concluir o produto. Segue o formato exigido pelo
> Prompt Mestre (Partes A–G + Gate), mas parte do estado real do projeto, não de
> uma folha em branco.
>
> **Data:** 2026-07-20 · **Responsável pela aprovação:** Eder (owner) ·
> **Regra de ouro:** nada é implementado fora do contrato; toda mudança é
> aprovada por humano, versionada e registrada em [DECISIONS.md](DECISIONS.md).
>
> ⚠️ **Esta fase não gera código de produção.** É um plano aprovável. Código só
> depois do gate.

---

## 0. Como ler este documento

O Prompt Mestre foi escrito como se o projeto fosse começar do zero, descrevendo
um Kanban genérico de Field Service (17 colunas fixas, FSM complexo de card, etc.).
**O projeto real já divergiu desse rascunho de forma deliberada e aprovada** — ver
§1 (Divergência de domínio) e o Decision Log. Portanto este plano faz três coisas:

1. **Reconcilia** o modelo genérico do prompt com o modelo real já contratado.
2. **Mapeia** cada uma das 30 seções do prompt contra o que já existe
   (✅ Feito · 🟡 Parcial · ⬜ Não iniciado).
3. **Fecha** com o roadmap para *terminar* o produto e o Gate de aprovação.

Legenda de status usada em todo o documento:

| Símbolo | Significado |
|---|---|
| ✅ | Entregue e verificado contra Supabase real |
| 🟡 | Parcial — base existe, falta completar |
| ⬜ | Planejado, não iniciado |
| 🔒 | Fora do MVP, previsto na arquitetura para fase futura |

---

# Parte A — Executive Summary

### Problema
A Delta Professional Cleaning agenda serviços de limpeza em campo por planilhas e
canais informais. Não há fonte única de verdade para o dia operacional, atribuição
de equipes, prazos, histórico de mudanças, nem base limpa para faturamento
(NetSuite) e execução em campo (Field Control).

### Solução
Um **portal Kanban próprio, estilo Trello mas adaptado a serviços em campo**, onde:
- **Board = um dia operacional** (ex. `JUL/16/26 · THURSDAY`);
- **List (coluna) = um trabalhador/fornecedor** (a primeira lista é o pool
  *DELTA OFFICE / WAREHOUSE*);
- **Card = um serviço agendado** para aquele trabalhador naquele dia.

Criar um board **gera automaticamente uma coluna por funcionário ativo** do roster.
Cada card carrega o briefing estruturado do serviço, labels, checklist, comentários
e anexos, com trilha de auditoria completa.

### Valor
- Uma tela por dia com toda a operação visível e editável em segundos.
- RBAC por papel + região + nível de acesso, aplicado no servidor (RLS + RPCs).
- Auditoria imutável de tudo que importa.
- Modelo de dados já preparado (mas desacoplado) para Field Control e NetSuite —
  o portal **funciona mesmo se a integração cair**.

### Escopo (resumo)
MVP = autenticação, multiusuário, RBAC, múltiplos boards (dias), colunas
auto-geradas por worker, cards com edição rápida, card detail (labels, datas,
prioridade, checklist, comentários, anexos), audit log, filtros, exportações
CSV/XLSX, administração de usuários e roster, dashboard básico e **modelo de dados
integration-ready**. Fora do MVP inicial: app nativo, GPS próprio, chat completo,
automações avançadas, IA, portal do cliente, billing/payroll completos, otimização
de rotas — todos previstos na arquitetura.

### Riscos (topo)
1. Regras de RBAC "assigned" (operador vê só a própria lista) ainda não expressáveis
   — falta o link `membership ↔ worker`. **Decisão pendente.**
2. Integração Field Control/NetSuite depende de credenciais e validação de API que
   ainda não temos em mãos.
3. Projeto Supabase é **compartilhado** com apps em produção (Check List App, 199
   usuários) — isolamento por schema é mandatório e já implementado, mas exige
   disciplina contínua.

### Recomendação
**Aprovar a continuidade** fechando as decisões pendentes (§ Gate). O produto já
está em estado utilizável (G1.6); as próximas fases são incrementais e de baixo
risco. Recomendo seguir para **G2 (Governança completa) + G3 (Views operacionais)**
antes de abrir as integrações externas (G6/G7).

---

# Parte B — Product Requirements Document

## 1. Divergência de domínio (decisão fundadora — já aprovada)

O Prompt Mestre descreve um Kanban genérico com **17 colunas de fluxo fixas**
(New Requests → … → Closed / Cancelled / Integration Error) e um card com dezenas
de campos e um FSM de faturamento embutido nas colunas.

**O produto real adotou um modelo mais enxuto e mais fiel à operação da Delta:**

| Dimensão | Prompt Mestre (genérico) | Produto real (contratado, G0/G1) |
|---|---|---|
| Board | Um projeto/fluxo | **Um dia operacional** |
| Coluna | Etapa de fluxo (17 status) | **Um worker/vendor** (pool + 1 por funcionário) |
| Card | Ordem de serviço genérica | **Um serviço agendado** com briefing estruturado |
| Status do card | Coluna = status | `cards.status` separado do `list_id` (ver FSM abaixo) |
| Fluxo de faturamento | Colunas Invoiced/Closed | Estados `invoiced`/`paid` do card, governança pós-conclusão |

**Por que divergimos:** o fluxo operacional real da Delta é "quem faz o quê, em que
dia". Mover um card entre colunas = **reatribuir o serviço a outro trabalhador**, não
avançar um funil. O status do serviço (agendado → em progresso → concluído →
faturado) vive no campo `status`, independente da coluna. Isso mantém o board legível
com dezenas de trabalhadores e evita o funil de 17 colunas que não corresponde ao dia
a dia. **Registrado em G0/G1; mantido.**

> As 17 colunas do prompt e os campos genéricos do card **não são descartados** —
> viram, onde fazem sentido, valores de `status`, `labels` e `service_type`, ou
> campos previstos para fases futuras (billing/payroll). Ver §8.

## 2. Usuários / Personas — matriz de perfis

O contrato colapsou os 9 perfis do prompt em **6 papéis (`role`)** + **3 níveis de
acesso (`access`)** + **região**, o que cobre os 9 casos sem redundância:

| Perfil do prompt | Mapeamento no produto |
|---|---|
| Super Administrator | `role=admin`, `access=admin`, `region=all` |
| Administrator | `role=admin` com escopo de org (org única hoje) |
| Operations Manager | `role=coordinator` |
| Scheduler / Dispatcher | `role=coordinator` (ou supervisor por região) |
| Supervisor | `role=supervisor` (escopo `region`) |
| Finance | `role=finance` |
| Field Employee | `role=operator` (escopo `assigned` — ver risco #1) |
| Read-Only | `role=viewer` / `access=none` |
| Client User 🔒 | fase futura (portal do cliente) |

**Status:** ✅ papéis, regiões e níveis existem no schema (`memberships`), são
resolvidos via `provision_me()` e enforce via RLS + RPCs (G1.6).
✅ (D6) Escopo "assigned" do operador agora é **exato**: `memberships.worker_id`
(migração `0010_worker_link.sql`) — operador vinculado vê pool + a própria lista e
só edita/reordena os próprios cards; sem vínculo, fallback = região (superset).

## 3. Matriz de permissões (RBAC)

Já contratada e implementada. Fonte única: [permissions-matrix.md](permissions-matrix.md).

**Níveis de acesso** (`memberships.access` / `workers.access`):

| Nível | Cards | Workers / Boards |
|---|---|---|
| admin | criar / editar / **excluir** | add/**excluir** workers, boards; gerir membros |
| editor | criar / editar / corrigir | — (não exclui nada) |
| none | somente ver | somente ver (default) |

**Módulo × papel** (full · region · assigned · view · none):

| Módulo | Coordinator | Supervisor | Operator | Finance | Viewer |
|---|---|---|---|---|---|
| Boards & Cards | full | region | assigned | view | view |
| Schedule / allocation | full | region | view | view | view |
| Exports | full | region | none | full | none |
| Audit | full | region | none | view | none |
| Integrations | full | none | none | view | none |
| Members & RBAC | full | none | none | none | none |

**Status:** ✅ Enforce server-side em `0002_rls.sql` + `0007_rbac.sql`
(helper `sees_all_regions()`, scoping de região em lists/cards, guardas de
role×transition em `card_transition()` e `card_move()`). Front-end espelha para
esconder/desabilitar UI, nunca como única barreira.

## 4. Estrutura organizacional

O prompt pede uma hierarquia longa (org → empresa → BU → dept → áreas → região →
location → team → … → job). **O contrato manteve `organization_id` em todas as
tabelas** (multi-tenant fiel) mas materializou hoje apenas o que a operação usa:
Organization, Membership/Worker, Client, Region (enum), Board(dia), List(worker),
Card(serviço).

**Status:** ✅ multi-tenant por `organization_id` (org única hoje).
🔒 BU/Department/FinancialArea/Project/Lot/Subdivision existem como campos no card
(`plan`, `lot`, `building`) e como entidades previstas — materializar em tabelas
próprias é fase futura, sem quebrar o schema atual.

## 5. Estrutura Kanban

**Status:** ✅ Múltiplos boards (um por dia), pool + colunas por worker
auto-geradas na criação do board (cap 40 no demo). Colunas têm `position`, `is_pool`,
`version`. 🟡 Configurabilidade avançada por coluna (WIP, SLA, regras de
entrada/saída, automações) — **fora do MVP**, o modelo enxuto não usa colunas de
fluxo; essas capacidades ficam para fase futura se surgir demanda.

## 6. Card (serviço) — campos e operações

**Campos** (data-model.md `cards`): id, organization_id, board_id, list_id, position,
status, scheduled_time, client_id/client_text, building, plan, lot, service_type,
address, fin_contact, ps_note, raw_title, done, version, timestamps, deleted_at.
Título estruturado (briefing) com campos derivados — ver [glossary.md](glossary.md).

**FSM do card** (service-state-machine.md): `unscheduled → scheduled → assigned →
in_progress → completed → invoiced → paid`, com ramos `on_hold`, `rework`,
`cancelled`. Mover entre listas **não** muda status. `paid` é terminal.

**Operações do card — status:**
| Operação | Status |
|---|---|
| criar / editar / mover / arquivar / cancelar | ✅ |
| checklist | ✅ (G1.4) |
| comentários / menções | 🟡 comentários no schema; UI parcial |
| anexos (upload + signed URL) | ✅ (G1.5) |
| labels | ✅ (15 labels seed) |
| duplicar / edição em massa / atalhos | 🟡 parcial / ⬜ |
| dependências / card relacionado | ⬜ (modelo previsto) |
| enviar/reprocessar integração | 🟡 fila existe; produtor ⬜ |

**Campos personalizados** (texto, número, moeda, data, seleção, fórmula…): ⬜
Previstos como `CustomField`/`CustomFieldValue` — **fora do MVP**.

## 7. Visualizações

| View | Status |
|---|---|
| Board (Kanban, drag-and-drop, realtime) | ✅ (G1.2 realtime) |
| Table (spreadsheet, filtros, sort, CSV, edição inline, saved views) | ✅ (G3.1/G3.4) |
| Calendar (mês/semana sobre os boards-dia) | ✅ (G3.2) |
| Timeline | 🔒 fase futura |
| Workload (carga por worker/equipe, horas) | ⬜ (G5) |
| Map | 🔒 fase futura |
| Dashboard (status, região, top clientes, integração) | ✅ (G3.1) · horas prev×real ⬜ (G5) |

## 8. Regras de negócio consolidadas
- Board único por `date` por org; meses passados = `closed`, agrupados na galeria.
- Criar board → gera pool + 1 lista por worker ativo.
- Mover card = muda `list_id`/`position`, emite `card.moved`, **não** muda status.
- `done=true` ⇒ `completed` (checkbox). `invoiced/paid` = governança pós-conclusão.
- Toda mutação relevante gera `audit_event` (imutável, RPC-only, não forjável).
- Concorrência: coluna `version` + RPCs que devolvem o objeto do servidor (409-equiv).

## Critérios de aceite (produto) — ver Parte F por fase.

---

# Parte C — Code Design Specification

## Arquitetura de informação / navegação
Fluxo real do app (App.jsx): `login → gallery (boards por mês) → board (dia) →
card modal`, com seções administrativas (roster, members, exports, integration,
audit) na TopNav. **Status: ✅**

## Wireframes / telas
Handoff de design ("Claude Design") existe em `Portal Schedule/` (protótipo HTML +
contratos congelados). As 9 telas do handoff foram portadas para React.

Mapa das **16 telas prioritárias** do prompt:

| # | Tela | Componente | Status |
|---|---|---|---|
| 1 | Login | `Login.jsx` | ✅ |
| 2 | Dashboard | `Dashboard.jsx` | ✅ (G3.1) |
| 3 | Boards | `Gallery.jsx` | ✅ |
| 4 | Kanban Board | `Board.jsx` | ✅ (realtime, DnD) |
| 5 | Card Detail | `CardModal.jsx` | ✅ (checklist, anexos, labels) |
| 6 | Table View | `TableView.jsx` | ✅ (G3.1/G3.4 — filtros, sort, CSV, edição inline, saved views) |
| 7 | Calendar | `Calendar.jsx` | ✅ (G3.2 — mês/semana) |
| 8 | Audit Log | `Audit.jsx` | ✅ |
| 9 | Export Center | `Exports.jsx` | ✅ CSV/JSON client-side (G2.1) · worker XLSX/PDF pronto p/ deploy |
| 10 | Users | `Members.jsx` | ✅ |
| 11 | Roles & Permissions | `Members.jsx` (+ matriz) | ✅ (matriz estática) |
| 12 | Teams | `Teams.jsx` | ✅ (G5.1 — CRUD; migração 0011) |
| 13 | Customers | `Customers.jsx` | ✅ (G5.1 — CRUD real na tabela `clients`) |
| 14 | Locations | `Customers.jsx` (aba) | ✅ (G5.1 — visão derivada; entidade própria = futuro) |
| 15 | Integration Monitor | `Integration.jsx` | ✅ (UI) / produtor ⬜ |
| 16 | Settings | — | ⬜ |

**15/16 telas prontas — falta só Settings.** Card Detail full-page: o produto usa
modal/drawer — full page é opcional (fase futura).

## Design system
✅ Tokens de design aplicados via Tailwind v4 + paleta oficial da marca (Manual ID
Delta Pro Clean, PDF em `docs/brand/`), logos oficiais (horizontal/vertical).
Componentes-base implementados nas telas existentes. 🟡 Um design-system
documentado/isolado (tokens + biblioteca de componentes catalogada) ainda não existe
como pacote separado — hoje vive no CSS/`index.css` e nos componentes. Consolidar em
`§design-system` é item de G2/G3.

## Protótipo navegável
✅ O próprio app em demo mode (sem `.env`, mock determinístico) serve de protótipo
navegável cobrindo login → board → card → checklist → comentário → audit → filtros.

## Component architecture
✅ Árvore atual: `App` (routing + modal) → `Login`, `TopNav`, `Gallery`, `Board`,
`CardModal`, `Roster`, `Members`, `Exports`, `Integration`, `Audit`; libs
(`api`, `mock`, `supabase`, `stateMachine`, `present`, `title`). 🟡 Formalizar
permission guards / error boundaries / loading boundaries como componentes
reutilizáveis é item de robustez (G2).

## Responsividade / acessibilidade
✅ (G3.3) Breakpoints ≤860/760/520px: brand panel do login some, headers quebram e
reduzem padding, card modal vira 1 coluna; board mantém scroll horizontal. A11y:
`:focus-visible`, `prefers-reduced-motion`, card modal como `dialog` (Escape + foco
gerido), checkboxes/tiles operáveis por teclado, alternativa de teclado ao DnD
("Move to" no card), `aria-sort`/`aria-current`/`aria-pressed`/labels. Verificado
sem overflow horizontal a 375px.

---

# Parte D — Technical Architecture

## Stack real (G1 — Supabase-native)

| Camada | Implementação | Status |
|---|---|---|
| UI | React 19 + Vite 8 + Tailwind v4 | ✅ |
| Dados / API | Supabase Postgres, schema `schedule_portal`, via PostgREST + RPCs | ✅ |
| Auth | Supabase Auth (email/senha) + `provision_me()` | ✅ |
| Realtime | Supabase Realtime (postgres_changes) | ✅ (G1.2) |
| Storage | Supabase Storage, bucket `schedule-attachments` (privado) | ✅ (G1.5) |
| Filas / async | tabelas-fila + `pg_cron`/Edge Functions | 🟡 export-worker escrito (G2.1), deploy pendente |
| PWA | `vite-plugin-pwa` presente | 🟡 configurar (G8) |

**Pivot G0→G1 (aprovado):** trocamos NestJS + Redis/BullMQ + S3 + WebSocket
self-hosted por primitivos Supabase. Motivo: custo (~$10+/mo evitados) e
consistência com os demais apps da Delta. O `openapi.yaml` fica como referência do
contrato de API; a API viva é PostgREST + RPCs (migração 0004). Ver DECISIONS G1.

## Back-end (módulos lógicos)
Implementados como RPCs/RLS por domínio: auth/provisioning, memberships,
boards, lists, cards (transition/move), comments, attachments, audit, exports (fila),
integration (fila). 🟡 Módulos "reports" e "notifications" ⬜.

## Infraestrutura / hosting
✅ Schema `schedule_portal` **dentro do projeto compartilhado** `sryywirmhohrdsssujwf`
(hospeda também Check List App em prod/199 usuários, Expense Portal, sheets-sync).
Isolamento total por schema — nunca toca `public.*`. Decisão de custo/consistência,
G1. Deploy do front-end: ✅ **Vercel** (D7, `vercel.json`) — env vars nas settings do
projeto, não commitadas.

## Observabilidade
🟡 Audit log ✅. Application logs / error tracking (Sentry-like) / uptime / alertas /
health checks / queue monitoring ⬜ — item de G2/G4.

---

# Parte E — Data Architecture

## Entidades implementadas (migrações 0001–0007)
`organizations, memberships, workers, clients, boards, lists, cards, labels,
card_labels, checklist_items, comments, attachments, audit_events, exports,
integration_events`. ✅ Schema, RLS, storage, transitions, review-fixes, realtime,
RBAC — todos aplicados e verificados contra Supabase real.

Modelo completo, tipos, relacionamentos, índices, constraints, soft-delete:
ver [data-model.md](data-model.md) (autoritativo).

## Entidades previstas, ainda não materializadas
`BusinessUnit, Department, FinancialArea, OperationalArea, Region(tabela),
Team, TeamMember, Subdivision, Project, Lot, Notification, SavedView, CustomField,
CustomFieldValue, IntegrationConnection, IntegrationMapping, IntegrationJob,
IntegrationError, ExportJob`. Muitas existem hoje como **enum** (region), **campo**
(plan/lot/building) ou **tabela-fila** (integration_events, exports). Materializar
como tabelas próprias é incremental e não quebra o schema atual. 🔒/⬜

## Auditoria (modelo)
✅ `audit_events` imutável, RPC-only (política de insert direto removida em G1.1 —
não forjável). Campos: actor, verb (LOGIN/CREATE/UPDATE/MOVE/COMPLETE/EXPORT/
DELETE/REPROCESS), entity_type/id, scope, detail(jsonb), ip, created_at.
✅ (G4.1) UI de auditoria com diff before→after, filtros, busca e export CSV; colunas
`correlation_id/request_id/session_id` + funções de retenção (`prune_audit` com piso
de 730 dias, `prune_notifications`) prontas p/ deploy (`0009_notifications_audit.sql`).

## Diagrama ER
Textual em [data-model.md](data-model.md). ⬜ Gerar diagrama visual (dbdiagram/mermaid)
como entregável de G2.

---

# Parte F — Delivery Roadmap

## O que já foi entregue

| Gate | Entrega | Data |
|---|---|---|
| **G0** | Contrato de domínio congelado (glossary, data-model, permissions, FSM, events, openapi) | 2026-07-17 |
| **G1** | Pivot para Supabase-native (aprovado) | 2026-07-17 |
| **G1.1** | 9 telas em React + data layer mock↔Supabase; verificado real; roster→board auto-gen; review-fixes | 2026-07-17 |
| **G1.2** | Realtime no board | 2026-07-18 |
| **G1.3** | Admin screens (members/audit/exports/integration) ligados ao Supabase | 2026-07-18 |
| **G1.4** | Checklist UI no card | 2026-07-18 |
| **G1.5** | Upload de anexos (storage + signed URL) | 2026-07-18 |
| **G1.6** | RBAC fino: role gates + region scoping (RLS + RPCs) | 2026-07-18 |

**Estado atual:** MVP funcional. Falta fechar governança, views operacionais,
integrações e mobile.

## Roadmap para concluir (fases propostas)

### G2 — Fundação de produção & Governança (em andamento)
- ✅ Host definido (Vercel, D7) + `vercel.json` + **DEPLOY.md**; falta ligar o projeto
  Vercel ao repo e configurar as env vars (passo manual, precisa da conta Vercel).
- 🟡 Exports (G2.1): **CSV/JSON client-side funcionando e logado** hoje; worker
  assíncrono (XLSX/PDF/grandes) **pronto p/ deploy** (`0008_exports.sql` +
  Edge Function `export-worker`), ainda não implantado (precisa de acesso Supabase).
- Consolidar **design system** documentado (tokens + catálogo de componentes).
- Error boundaries / loading boundaries / permission guards como componentes.
- Observabilidade mínima: error tracking + health checks + queue monitor.
- Diagrama ER visual; testes automatizados base (ver Parte "Testes").
- **Gate:** governança e deploy prontos.

### G3 — Views operacionais (em andamento)
- ✅ **Table View** (spreadsheet, filtros, sort, CSV export) — G3.1.
- ✅ **Dashboard** (status, região, top clientes, integração) — G3.1.
- ✅ **Calendar** (mês/semana sobre os boards-dia) — G3.2.
- ✅ **Responsividade + acessibilidade** (WCAG/teclado/ARIA; alternativa de teclado ao
  DnD via "Move to" no card) — G3.3.
- ✅ **Edição inline na Table + saved views** (localStorage) — G3.4.
- ⬜ Backlog não-bloqueante: busca global cross-board; tabela `SavedView` compartilhada.
- **Gate G3: ✅ LIBERADO** — operação diária completa em desktop/tablet/mobile.

### G4 — Governança avançada (em andamento)
- ✅ Audit: diff previous/new + filtros + busca + correlation id + export CSV; colunas
  correlation/request/session + funções de retenção prontas p/ deploy (G4.1).
- 🟡 Notificações **in-app** ✅ (bell + panel + mark-read) — G4.1. Producers prontos
  p/ deploy: `export.ready` (0009) + `assignment.new`/`service.completed`/
  `integration.dlq` (0010, destravados pelo D6). E-mail/push/Teams: futuro.
- ⬜ Data retention aplicada / soft-delete policy / privacy controls; threat model formal.

### G5 — Operations (em andamento)
- ✅ Calendar (G3.2, entregue adiantado).
- ✅ Teams (tela + migração `0011_teams.sql`), Customers (CRUD real em `clients`),
  Locations (visão derivada por endereço) — G5.1.
- ⬜ Workload (carga por worker/equipe) — depende de horas prev×real no card.
- ⬜ Entidade CustomerLocation própria (multi-site + geo) — decisão de contrato futura.

### G6 — Field Control (integração) 🔒→⬜
- Mappings, sync (customers/locations/employees/orders/tasks/status/check-in/out/
  hours/notes/photos), escrita validada, retries, DLQ, idempotency, reconciliation,
  integration monitor ligado ao produtor real. **Depende de credenciais + validação
  de API.**

### G7 — NetSuite (integração) 🔒→⬜
- Customers/projects/items/departments/locations/classes/invoices/sales orders/
  payroll-supporting/billing status/accounting dimensions; reconciliação.

### G8 — Mobile & Client Portal 🔒→⬜
- PWA (supervisor/employee), geolocalização, push; portal do cliente.

## Dependências entre fases
G2 destrava G3/G4. G6 depende de G5 (customers/locations) + credenciais externas.
G7 depende de G6 (dados operacionais limpos). G8 depende de G3 (responsivo/a11y).

---

# Parte G — Decision Log (decisões-chave)

Registro completo em [DECISIONS.md](DECISIONS.md). Resumo das decisões estruturais:

| # | Decisão | Alternativas | Recomendação | Status |
|---|---|---|---|---|
| D1 | Board=dia, List=worker, Card=serviço | Kanban de funil (17 colunas) | Manter modelo enxuto | ✅ Aprovado (G0) |
| D2 | Supabase-native | NestJS+Redis+S3 self-hosted | Supabase (custo/consistência) | ✅ Aprovado (G1) |
| D3 | Schema `schedule_portal` em projeto compartilhado | Projeto Supabase dedicado | Compartilhado, isolado por schema | ✅ Aprovado (G1) |
| D4 | Supabase Auth como identidade (sem tabela `users`) | Tabela `users` própria | Supabase Auth + memberships | ✅ Aprovado (G1) |
| D5 | RBAC via RLS + RPCs | Guards só no app | Server-side (RLS+RPC) | ✅ Aprovado (G1.6) |
| D6 | `memberships.worker_id` p/ escopo "assigned" do operador | Tratar operador como region (superset) | Adicionar o link | ✅ Aprovado (2026-07-20, `0010_worker_link.sql`) |
| D7 | Host do front-end = **Vercel** | Netlify / Supabase Hosting | Vercel (deploy simples + previews) | ✅ Aprovado (2026-07-20) |
| D8 | Momento de abrir integrações (G6/G7) | Agora vs. após G5 | Após G5 + credenciais | ⏳ **Pendente** |

---

# Plano de Testes (transversal)

⬜ Ainda não há suíte automatizada. Plano proposto (base em G2):
- **Unit / component:** libs (`stateMachine`, `present`, `title`), componentes-chave.
- **Integration / API:** RPCs (`card_transition`, `card_move`, `provision_me`),
  políticas RLS por papel/região (permission tests — críticos).
- **E2E:** criar card, mover, edição concorrente (version/409), permissão negada,
  exportação, upload inválido, restauração, audit trail.
- **Security:** RLS cross-org (não vazamento), upload validation, CSP/XSS/CSRF.
- **Timezone/DST:** boards por data, `scheduled_time`, audit em UTC.
Cenários obrigatórios listados no prompt §23 mapeados 1:1 acima.

---

# Segurança (estado + threat model inicial)

✅ TLS (Supabase), RLS por org+região, Auth gerencia senha/2FA/lockout, storage
privado com políticas por nível de acesso, audit imutável RPC-only.
🟡/⬜ CSP explícita, validação de upload (tipo/tamanho/AV), rate limiting a nível
app, secrets management documentado, backups/DR (Supabase provê; documentar RPO/RTO),
threat model formal (STRIDE) — itens de G2/G4.

**Superfícies de ameaça (inicial):** (1) vazamento cross-org/região via RLS mal
escrita → mitigado por testes de permissão; (2) forja de audit → mitigado (RPC-only);
(3) upload malicioso → falta validação/AV; (4) escalada por RPC → guardas de
role×transition em 0007; (5) exposição de signed URLs → TTL 1h, bucket privado.

---

# GATE DE APROVAÇÃO

Conforme §29 do Prompt Mestre — **parar aqui, não gerar código de produção.**

### 1. Decisões já aprovadas
D1 (modelo Board=dia/List=worker/Card=serviço), D2 (Supabase-native), D3 (schema
compartilhado isolado), D4 (Supabase Auth), D5 (RBAC server-side). Todas em produção
via G0–G1.6.

### 2. Decisões pendentes (bloqueiam quais fases)
- ~~**D6** — adicionar `memberships.worker_id`.~~ ✅ **Resolvido** (2026-07-20) —
  migração `0010_worker_link.sql` pronta p/ deploy: escopo "assigned" exato do
  operador (RLS + RPCs) + producers de notificação que dependiam do link.
- ~~**D7** — host do front-end.~~ ✅ **Resolvido: Vercel** (2026-07-20) — `vercel.json`
  adicionado; deploy da G2 destravado.
- **D8** — quando abrir Field Control/NetSuite. *Bloqueia:* G6/G7 (+ credenciais).

### 3. Riscos críticos
- Projeto Supabase compartilhado com prod (199 usuários) → disciplina de isolamento.
- Integrações externas dependem de credenciais/validação de API ainda indisponíveis.
- Ausência de suíte de testes automatizada (risco de regressão) → endereçar em G2.

### 4. Escopo do MVP (já majoritariamente entregue)
Auth ✅, multiusuário ✅, roles/permissions ✅, múltiplos boards ✅, colunas
auto-geradas ✅, cards + edição/DnD ✅, card detail (labels/datas/checklist/
comentários/anexos) ✅/🟡, audit log ✅, filtros 🟡, table view ⬜, export CSV/XLSX
🟡 (UI ✅/worker ⬜), admin de usuários/roster ✅, dashboard básico 🟡, modelo
integration-ready ✅.

### 5. Recursos deixados para fases futuras
App nativo, GPS próprio, chat realtime completo, automações avançadas, IA, portal do
cliente, billing/payroll completos, otimização de rotas, custom fields, timeline/map
views. Todos previstos na arquitetura.

### 6. Tecnologias recomendadas (confirmadas)
React 19 + Vite + Tailwind v4 · Supabase (Postgres/Auth/Realtime/Storage) · schema
`schedule_portal` · PostgREST + RPCs · PWA (vite-plugin-pwa) para G8.

### 7. Telas prontas para design/uso
Prontas: Login, Boards, Kanban, Card Detail, Audit, Users, Roles&Permissions,
Integration Monitor (UI). A desenhar/implementar: Table, Calendar, Workload,
Dashboard completo, Teams, Customers, Locations, Settings, Export Center (worker).

### 8. Integrações que dependem de validação
Field Control (credenciais + contrato de API + mappings) e NetSuite (dimensões
contábeis + acesso). Nenhuma pode entrar em G6/G7 sem validação externa.

### 9. Custo e complexidade relativa (por fase)
| Fase | Complexidade | Custo incremental |
|---|---|---|
| G2 Governança/deploy | Média | Baixo (host + Supabase atual) |
| G3 Views operacionais | Média-alta | Baixo |
| G4 Governança avançada | Média | Baixo |
| G5 Operations | Alta | Baixo-médio |
| G6 Field Control | Alta | Médio (depende de API) |
| G7 NetSuite | Alta | Médio-alto |
| G8 Mobile/Client | Alta | Médio |

Infra atual continua praticamente sem custo adicional (Supabase compartilhado).

### 10. Recomendação
**Aprovar e seguir para G2 + G3.** Fechar D6 e D7 imediatamente (baixo esforço,
destravam deploy e RBAC). Adiar D8 (integrações) até G5 concluída e credenciais em
mãos. O produto já é utilizável; o restante é incremental e de baixo risco.

---

> **Próximo passo:** após aprovação expressa deste plano, será criado um **plano de
> implementação específico de G2** (deploy + export worker + design system + testes
> base). Nenhum código de produção antes disso — Regra de Ouro.
