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

- Route handlers belong in `app/api/**/route.ts`.
- Shared domain logic belongs in `lib/<domain>/...`.
- Reusable UI belongs in `components/`.
- Integration tests belong in `tests/integration/`.
- Contract/governance docs belong in `docs/social/`.
