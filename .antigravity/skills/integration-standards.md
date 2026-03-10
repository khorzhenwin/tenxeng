# Integration Standards

Shared skill for non-Cursor agents. Mirrors `.cursor/skills/integration-standards/SKILL.md`.

## When To Use

Use this skill when you:
- Add or modify API routes under `app/api`
- Change auth-protected server behavior
- Update endpoint validation or status code behavior
- Add integration tests or change test setup
- Touch cross-cutting social/chat/pvp contracts

## Status Code Contract

- `401`: missing/invalid session
- `403`: forbidden by ownership/friendship/block checks
- `404`: missing entity
- `409`: invalid state transition
- `429`: rate-limited request
