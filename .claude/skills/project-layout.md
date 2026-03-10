# Project Layout

Shared skill for non-Cursor agents. Mirrors `.cursor/skills/project-layout/SKILL.md`.

## Top-Level Map

- `app/`: Next.js App Router pages, layouts, and API routes
- `components/`: Reusable React UI components
- `lib/`: Shared domain/server/client logic
- `tests/integration/`: Integration tests (Vitest + Firebase emulator)
- `docs/social/`: Product/API/rollout documents for social features
- `public/`: Static assets

## Placement Rules

### Pages And App Router
- Public pages and layout belong in `app/`.
- Auth pages belong in `app/(auth)/...`.
- Dashboard/product experience belongs in `app/dashboard/...`.
- Route handlers belong in `app/api/**/route.ts`.

### API Route Organization
- Group endpoints by domain (`chat`, `friends`, `pvp`, `notifications`, etc.).
- Keep route file focused on request validation, auth, orchestration, and response mapping.
- Push reusable business logic into `lib/<domain>/...`.

### Tests And Docs
- Add/update integration tests in `tests/integration/`.
- Update social/API behavior docs in `docs/social/` when contracts or governance change.
