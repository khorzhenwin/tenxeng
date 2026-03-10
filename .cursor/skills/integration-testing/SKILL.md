---
name: integration-testing
description: Write and maintain integration tests for this project using Vitest and Firestore emulator patterns, including auth mocking, seeded fixtures, route invocation, and behavior assertions. Use when adding features or changing API behavior that requires integration coverage.
---

# Integration Testing

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

## Project Testing Pattern

- Test runner: Vitest (`environment: "node"`, non-parallel execution).
- Test scope: `tests/integration/**/*.test.ts`.
- Auth pattern: mock `@/lib/auth/server` and drive identity via `setAuthedUser(...)`.
- Data isolation: clear Firestore emulator state before each test.
- Route invocation: import `GET/POST` handlers and call them with `Request` objects.

## Default Workflow

1. Pick the closest existing integration test file by domain (chat/social/rate-limit).
2. Mock session user with in-test `authState` + `vi.mock("@/lib/auth/server")`.
3. Add `clearFirestore()` helper and reset state in `beforeEach`.
4. Seed only minimal required docs via `adminDb` for scenario setup.
5. Call route handlers directly and assert:
   - HTTP status code
   - response payload shape/content
   - persisted Firestore state when relevant
6. Cover at least one negative/guardrail path (`401`, `403`, `409`, `429`, etc.).

## Checklist

- [ ] Test file is under `tests/integration/`.
- [ ] `FIRESTORE_EMULATOR_HOST` precondition is enforced (when needed).
- [ ] Auth is mocked consistently with existing pattern.
- [ ] Emulator data is cleared before each test.
- [ ] Assertions include status code and business outcome.
- [ ] New behavior updates existing tests or adds targeted new cases.

## Guardrails

Do:
- Keep fixtures minimal and explicit.
- Assert contract-level behavior first, then storage details.
- Reuse existing helper patterns from current integration tests.

Do not:
- Depend on production Firebase credentials.
- Add flaky timing-dependent sleeps.
- Over-mock internals when route-level behavior should be exercised.
- Put integration tests outside `tests/integration/` without explicit reason.

## Commands

- Run all integration tests: `npm run test:integration`
- Run a focused test file: `npx vitest run tests/integration/chat.integration.test.ts`

## Validation Before Finishing

- Confirm test remains deterministic in sequential mode.
- Confirm status code semantics match `docs/social/API_CONTRACTS.md`.
- Ensure no test leaks data across test cases.
