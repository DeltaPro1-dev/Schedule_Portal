# Portal Operacional Delta — Planejamento Completo

Documento único consolidando as decisões, o que foi construído e o que falta.
Fonte: histórico de trabalho do projeto (Schedule Portal + integrações).
Atualizado: 2026-07 · Repo: `DeltaPro1-dev/Schedule_Portal` (tudo na `main`).

---

## 1. Visão do produto
Portal operacional estilo **Trello** para a Delta Pro Clean gerenciar a operação de
limpeza em campo.

- **Board = um dia de operação** (ex.: `JUL/24/26 · FRIDAY`); meses passados arquivam.
- **List (coluna) = um worker/prestador**; a 1ª lista, *DELTA OFFICE / WAREHOUSE*, é o pool.
- **Card = um serviço agendado** para aquele worker no dia (briefing estruturado, labels,
  checklist, comentários, anexos).
- **Regiões:** North, South, St George, Another State.
- Criar um board **auto-gera uma coluna por funcionário ativo** do roster.

---

## 2. Decisões estratégicas

### 2.1 Custo / infraestrutura (decidido)
- Supabase cobra **$25/mês flat por organização (Pro)** + **~$10/mês de compute por
  projeto ativo** + GST. Com 4 projetos a conta projetava **~$48/mês**.
- **Não migrar** para AWS/Azure/GCP: o compute mínimo é parecido ou mais caro e você
  perderia auth/storage/realtime que o Supabase já dá. O que multiplica custo é o
  **número de projetos**, não o fornecedor.
- **Regra:** app interno novo = **novo schema num projeto existente**, não projeto novo.
  Protótipos na org free. Ver memória `supabase-cost-strategy`.
- ⚠️ Google Workspace **não** tem banco (é Gmail/Drive); o banco seria Google Cloud
  (conta/cobrança separadas). Sem vantagem de custo.

### 2.2 Stack — pivô G0 → G1 (decidido, aprovado)
- **G0 (contrato congelado):** NestJS + PostgreSQL + Redis/BullMQ + S3 + WebSocket.
- **G1 (executado):** **React + Vite + Supabase** — para cortar custo e alinhar com os
  outros apps da Delta. O **modelo de domínio do G0 continua válido**; só a camada de
  execução mudou. Registrado em `DECISIONS.md`.
- **Hospedagem:** schema **`schedule_portal`** dentro do projeto **compartilhado**
  `sryywirmhohrdsssujwf` (que também roda Check List App, Expense Portal e sheets-sync).
  Tudo isolado no schema; nunca toca `public`.

### 2.3 Escopo realizado vs. visão-mestre
Os prompts originais (`Portal Schedule/` handoff) descrevem uma visão grande (~35
entidades, 17 colunas de estado, 20 telas, 9 roles). O que foi **realizado** é um MVP
focado (16 tabelas-base + extras, ~10 telas, 6 roles + 3 níveis de acesso). Seguindo o
escopo realizado; a visão grande fica como norte.

---

## 3. O que foi construído

### 3.1 Backend (Supabase — schema `schedule_portal`)
Migrations (aplicar em ordem no SQL Editor; há colisão de número 0006/0007 por trabalho
paralelo, mas todas aplicam por nome):
- `0001_schema` — 16 tabelas, enums, índices, 15 labels seed, org "Delta Pro Clean"
- `0002_rls` — grants, helpers, `provision_me()`, RLS por nível de acesso + org
- `0003_storage` — bucket `schedule-attachments`
- `0004_transitions` — `card_transition()` + `card_move()` (máquina de estados)
- `0005_review_fixes` — audit não-forjável + fix do `done`
- `0006_realtime` — publication/replica identity · `0007_rbac` — RBAC fino (role×região)
- `0008_exports` — worker de export assíncrono · `0009_notifications_audit`
- `0010_worker_link` — `memberships.worker_id` (escopo do operator)
- `0011_teams` · `0012_reprocess` — RPC do Integration Monitor
- `0013_imported_superintendent` — campos do superintendente no staging
- `0014_map_imported` — RPC `map_imported_schedules()` (staging → boards/cards)
- `0015_dictionary_and_board_columns` — `seed_board_columns()` + `service_dictionary`
- `seed_workers.sql` — roster inicial (rodar uma vez)

### 3.2 Front-end (React + Vite)
Portado fiel do handoff do **Claude Design** + expandido:
Login · Boards (Gallery) · Board (Kanban, drag-drop, day tabs, pool navy) · Card modal ·
Table (edição inline + saved views) · Dashboard · Calendar · Employees (Roster) ·
Members + matriz RBAC · Exports (CSV/JSON client-side; XLSX/PDF via worker) ·
Integration Monitor · Audit · Teams · Customers · Settings.
- **Paleta oficial** (Manual da marca, `docs/brand/`): navy **#393766** (Pantone 276),
  verde **#57B952** (Pantone 362) — em `src/index.css`.
- **Logos oficiais** em `public/logo-horizontal*.png` (branco no login navy; full-color no topo).
- Camada de dados `src/lib/api.js` troca **mock (demo) ↔ Supabase (real)** por env.

### 3.3 Modo real — está LIVE e verificado
- Auth por e-mail/senha + `provision_me()` (provisiona pela `memberships`).
- ⚠️ Usar a **publishable key** (`sb_publishable_…`) — a anon JWT legada foi desativada.
- Setup: rodar migrations → **expor o schema** `schedule_portal` (Settings → API →
  Exposed schemas) → semear membership admin + `seed_workers.sql` → `.env`. Ver `SETUP.md`.

---

## 4. Integrações dos portais (sem API → scraping)

Portais de clientes sem API. Padrão: **1 adapter por plataforma** (Playwright) → normaliza
→ **staging** `schedule_portal.imported_schedules` (idempotente por `source+external_id`)
→ **mapping** → boards/cards. Código em `integrations/`.

### 4.1 Feito
| Portal | Fonte do schedule | Estado | Agendado (Task Scheduler) |
|---|---|---|---|
| **SupplyPro (Hyphen)** | *To Do Calendar* (CalendarDay.asp) — cobre vários builders | ✅ live | seg–sex **06:00** |
| **Buildertrend** | dashboard *Work Schedule snapshot* (`rptrUpcomingSchedule`) | ✅ live | seg–sex **06:10** |

- **SupplyPro:** login (com "Force Login" pra assumir sessão) → To Do Calendar do
  **próximo dia** (sexta → sáb+dom+seg) → entra em cada ordem e captura builder,
  Plan/Elevation/Swing, Subdivision/Phase, Lot/Block, **superintendente** (nome/tel/email).
  ⚠️ *To Do Orders* (715) = **faturamento**, não schedule.
- **Buildertrend:** Auth0. **To Do Orders ≠ schedule** — usar o Work Schedule snapshot.

### 4.2 Aprendizados-chave (valem pros próximos)
- **reCAPTCHA bloqueia navegador automatizado** → `run.js` usa
  `chromium.launchPersistentContext` com **Chrome real** (`channel:'chrome'`) e a flag
  `--disable-blink-features=AutomationControlled`, num **perfil persistente por adapter**
  (`auth/<name>-profile`). Perfil confiável = reCAPTCHA não desafia + sessão persiste.
- SPA (Buildertrend) destrói o contexto no `page.evaluate` → extrair via `page.content()`
  + regex em Node.
- Login manual assistido de fallback: se aparecer captcha/2FA, resolver 1x em `--headful`.

### 4.3 Mapping staging → boards/cards (`map_imported_schedules()`)
- Cada import vira um **card** no board do seu `scheduled_date` (cria o board), numa
  coluna **"Unassigned"** (o coordenador arrasta pro worker). Idempotente via `mapped_card_id`.
- **Auto-colunas de employees** nos boards (`seed_board_columns`), igual à criação manual.
- **Dicionário de serviços** (`service_dictionary`) padroniza atividades variadas dos
  portais → serviço canônico + labels (commercial + serviço). Tabela editável.
- Roda automático após cada scrape + avulso via `npm run map`.

### 4.4 Pendente (integrações)
- Portais próprios: **Arive Homes, Ivory Homes, David Weekley** (cada um = 1 adapter).
- **Google Calendar via API** (sem scraping) — hoje é o quadro de despacho preenchido à mão.

---

## 5. Estado atual (resumo)
- ✅ App LIVE no Supabase real (auth, boards/cards, RLS, transições, drag-drop, realtime,
  anexos, RBAC, exports CSV/JSON), paleta + logos oficiais.
- ✅ 2 integrações live e agendadas (SupplyPro, Buildertrend) → staging → boards/cards
  com dicionário e auto-colunas.
- ⏳ Portais restantes + Google Calendar; deploy do export worker (XLSX/PDF); Field
  Control / NetSuite (precisam credenciais).

## 6. Tarefas agendadas (Windows Task Scheduler)
| Tarefa | Quando | Ação |
|---|---|---|
| `DeltaSchedulePortal-SupplyPro` | seg–sex 06:00 | `integrations/run-supplypro.cmd` |
| `DeltaSchedulePortal-Buildertrend` | seg–sex 06:10 | `integrations/run-buildertrend.cmd` |

*Interactive-only* (máquina ligada + logado). Para rodar deslogado: Task Scheduler →
"Run whether user is logged on or not" (pede senha do Windows).

## 7. Próximos passos sugeridos
1. Próximo portal: **Arive / Ivory / David Weekley** ou **Google Calendar (API)**.
2. Deploy do **export worker** (XLSX/PDF).
3. Field Control / NetSuite (fase futura, precisa credenciais).

## 8. Referências
- Setup: `SETUP.md` · Deploy: `DEPLOY.md` · Decisões: `DECISIONS.md`
- Contrato G0 + handoff do design: `Portal Schedule/`
- Manual da marca: `docs/brand/Manual_ID_Delta_Pro_Clean.pdf`
- Integrações: `integrations/` (adapters, `run.js`, `map.js`, wrappers `.cmd`)
- PRs desta jornada: #1 (fundação front+back), #7 (SupplyPro), #8 (superintendente),
  #9 (Buildertrend), #10 (wrappers), #11 (mapping), #12 (dicionário + auto-colunas).
