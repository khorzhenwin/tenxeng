# Integration Testing

Shared skill for non-Cursor agents. Mirrors `.cursor/skills/integration-testing/SKILL.md`.

## When To Use

Use this skill when:
- Adding or changing API route behavior
- Updating auth/rate-limit/social/chat/pvp flows
- Fixing regressions that span multiple modules
- Expanding Firestore-backed behavior requiring end-to-end verification

## Source Of Truth

- `vitest.config.ts`
- `tests/integration/setup.ts`
- `tests/integration/chat.integration.test.ts`
- `tests/integration/social.integration.test.ts`
- `tests/integration/rate-limit.integration.test.ts`

## Core Pattern

- Mock `@/lib/auth/server` and set user identity in-test.
- Clear Firestore emulator state in `beforeEach`.
- Seed minimal fixtures through `adminDb`.
- Invoke route handlers directly with `Request`.
- Assert status code, response payload, and persisted Firestore outcomes.
