# Portal Operacional Delta — Delta Pro Clean

Operational scheduling portal (Trello-style) for a field cleaning company.
Frozen shared contract + backend implementation guide for **Claude Code**.

## Product model
- **Board = one operating day** (e.g. `JUL/16/26 · THURSDAY`). Boards of the current month stay open; when a month ends, its boards are **archived** under a *Month Year* group.
- **List (column) = one worker/vendor** (employee, contractor or company). The first list, *DELTA OFFICE / WAREHOUSE*, is the resource pool.
- **Card = one scheduled service** for that worker on that day. The card title is a structured briefing (see `contracts/glossary.md`).
- **Regions:** North, South, St George, Another State.
- **Employee roster** is the base: creating a new board auto-generates one column per active worker.

## Repository layout
```
/contracts             ← frozen source of truth (openapi, data model, RBAC, events, state machine)
/docs                  ← backend implementation guide (phased build for Claude Code)
Portal Delta.dc.html   ← approved front-end prototype (reference for behavior/UX)
```

## For Claude Code — start here
1. Read `docs/BACKEND.md` (build order B1→B6, definition of done per phase).
2. Treat `contracts/openapi.yaml` as the API contract — generate server types from it and validate responses against it (contract testing).
3. Never implement anything outside the contract. If something is missing, open a contract-change proposal (see `docs/BACKEND.md > Change control`).

## Stack (approved at Gate G0)
NestJS (TypeScript) · PostgreSQL · Redis + BullMQ · WebSocket (Socket.IO) · S3-compatible storage · JWT auth + optional TOTP 2FA.
