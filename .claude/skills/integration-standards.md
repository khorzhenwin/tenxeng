# Integration Standards

Shared skill for non-Cursor agents. Mirrors `.cursor/skills/integration-standards/SKILL.md`.

## When To Use

Use this skill when you:
- Add or modify API routes under `app/api`
- Change auth-protected server behavior
- Update endpoint validation or status code behavior
- Add integration tests or change test setup
- Touch cross-cutting social/chat/pvp contracts

## API Route Baseline

For route handlers in `app/api/**/route.ts`:
- Export `runtime = "nodejs"`.
- Use `dynamic = "force-dynamic"` for dynamic endpoint behavior.
- Authenticate first (`getSessionUser`) for protected routes.
- Apply appropriate rate limiting before expensive reads/writes.
- Validate request payloads (prefer `zod` schemas near handler).
- Return contract-aligned status codes and concise JSON errors.

## Status Code Contract

- `401`: missing/invalid session
- `403`: forbidden by ownership/friendship/block checks
- `404`: missing entity
- `409`: invalid state transition
- `429`: rate-limited request

Keep these meanings stable across endpoints.
