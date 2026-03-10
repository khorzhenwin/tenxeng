---
name: integration-standards
description: Apply repository integration standards for API routes, auth checks, rate limiting, status codes, imports, testing, and lint discipline. Use when adding or changing endpoints, server workflows, Firestore writes, or integration tests.
---

# Integration Standards

## When To Use

Use this skill when you:
- Add or modify API routes under `app/api`
- Change auth-protected server behavior
- Update endpoint validation or status code behavior
- Add integration tests or change test setup
- Touch cross-cutting social/chat/pvp contracts

## Required References

- `docs/social/API_CONTRACTS.md`
- `docs/social/REALTIME_AND_RATE_LIMITING.md`
- `README.md`
- `lib/auth/server.ts`
- `lib/server/rate-limit.ts`
- `vitest.config.ts`
- `tests/integration/setup.ts`
- `eslint.config.mjs`
- `tsconfig.json`

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

## Rate Limiting Standards

- Use `consumeRateLimit` for non-polling interactions.
- Use `consumeSlidingWindowRateLimit` for polling endpoints:
  - chat conversations/messages/typing
  - notifications
- Keep key format per-user and endpoint-specific (`${uid}:<endpoint_key>`).
- Align policy with docs unless intentionally updating governance docs.

## Import And TypeScript Conventions

- Prefer `@/*` alias imports (`tsconfig.json`).
- Keep strict TypeScript assumptions (`strict: true`).
- Avoid ad-hoc relative import chains when `@/*` is clearer.

## Lint And Formatting Conventions

- Follow Next.js core-web-vitals + TypeScript lint config in `eslint.config.mjs`.
- Do not introduce lint suppressions unless necessary and justified.
- Keep route and utility code readable with clear naming and minimal nesting.

## Integration Testing Conventions

- Integration tests live in `tests/integration/**/*.test.ts`.
- Use existing setup path in `vitest.config.ts` and `tests/integration/setup.ts`.
- Keep tests deterministic (sequential execution is configured).
- Mock auth/session where appropriate and seed/clear Firestore consistently.

## Delivery Checklist

- [ ] Endpoint behavior aligns with API contract docs.
- [ ] Auth and rate-limiter guards are present and ordered correctly.
- [ ] Status codes match shared semantics.
- [ ] Input validation exists for all write endpoints.
- [ ] Tests updated for changed behavior.
- [ ] Lint passes on touched files.

## Anti-Patterns

Do not:
- Return inconsistent status codes for the same failure type.
- Skip limiter checks on polling-heavy endpoints.
- Introduce endpoint behavior that conflicts with social docs without updating docs.
- Add tests outside established integration structure unless explicitly needed.
