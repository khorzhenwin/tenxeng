---
name: project-layout
description: Navigate and extend this repository using consistent file placement across App Router routes, domain libraries, shared components, tests, and docs. Use when planning feature placement, creating new files, or refactoring code organization.
---

# Project Layout

## When To Use

Use this skill when you need to:
- Decide where new code should live
- Add new API routes or route handlers
- Add domain logic modules in `lib`
- Place tests/docs for new features
- Refactor files while preserving project structure

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

### Shared Libraries
- `lib/auth/`: auth/session helpers.
- `lib/firebase/`: Firebase client/admin initialization.
- `lib/server/`: server utilities (for example rate limiting).
- `lib/social/`: social domain logic and helpers.
- `lib/pvp/`: PvP domain types/helpers.
- `lib/quiz/`: quiz generation, embeddings, and quiz-specific utilities.
- `lib/store/`: client-side state stores.

### Components
- Add cross-page reusable components under `components/`.
- Keep route-specific rendering logic close to its route unless reuse justifies extraction.

### Tests
- Add/update integration tests in `tests/integration/`.
- Follow existing naming style and setup assumptions from `vitest.config.ts`.

### Docs
- Update social/API behavior docs in `docs/social/` when contracts or governance change.
- Keep README updates for setup, env, and run/test commands.

## New Feature Workflow

1. Identify feature domain (quiz, social, pvp, chat, auth).
2. Create or update API route(s) under matching `app/api/<domain>/...`.
3. Add/extend shared logic in `lib/<domain>/...`.
4. Update UI in `app/...` and/or `components/...`.
5. Add integration coverage in `tests/integration/...`.
6. Update docs when behavior/contracts changed.

## Conventions

- Prefer `@/*` path alias imports.
- Keep Firebase setup in `lib/firebase/*` only.
- Keep server-only logic out of client components.
- Preserve status code semantics and route runtime conventions.

## Guardrails

Do not:
- Scatter domain logic across unrelated top-level folders.
- Put shared business logic directly inside many route files.
- Add tests in ad-hoc directories outside `tests/integration` without strong reason.
- Change folder taxonomy without updating this skill and relevant docs.

## Quick References

- `app/layout.tsx`
- `app/page.tsx`
- `app/dashboard/page.tsx`
- `app/api/`
- `components/`
- `lib/`
- `tests/integration/`
- `docs/social/`
