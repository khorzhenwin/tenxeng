---
name: firebase-integration
description: Standardize Firebase integration for this project across client SDK, Admin SDK, auth/session flows, Firestore usage, and environment variables. Use when adding or modifying Firebase auth, Firestore reads/writes, API routes touching Firebase, or Firebase-related setup.
---

# Firebase Integration

## When To Use

Use this skill when work involves:
- Firebase Auth sign-in/session behavior
- Firestore reads/writes in API routes
- Firebase client/admin SDK initialization
- Environment variable setup for Firebase
- Rate limiting that persists in Firestore

## Quick Start Workflow

1. Identify runtime context:
   - Browser/client component -> use `@/lib/firebase/client`.
   - Server/API route -> use `@/lib/firebase/admin`.
2. Verify API route shape:
   - `export const runtime = "nodejs"`
   - `export const dynamic = "force-dynamic"` (for dynamic routes)
3. Enforce auth first for protected endpoints:
   - Use `getSessionUser()` from `@/lib/auth/server`.
4. Apply rate limits before expensive work:
   - `consumeRateLimit()` for standard writes/actions.
   - `consumeSlidingWindowRateLimit()` for polling endpoints.
5. Return consistent errors:
   - `401` unauthorized, `403` forbidden, `404` not found, `409` invalid state, `429` rate-limited.

## Project Defaults

- Client SDK initialization is centralized in `lib/firebase/client.ts`.
- Admin SDK initialization is centralized in `lib/firebase/admin.ts`.
- Session verification lives in `lib/auth/server.ts`.
- Firestore-backed rate limiting uses `__rateLimits` via `lib/server/rate-limit.ts`.
- API contract expectations are documented in `docs/social/API_CONTRACTS.md`.

## Environment Variables

Required client variables:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Required server variables:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (newline-safe with `\n`)

Reference:
- `.env.example`
- `README.md`

## Integration Standards

- Import Firebase client SDK only from `@/lib/firebase/client` in browser code.
- Import Admin SDK only from `@/lib/firebase/admin` in server code.
- Do not initialize Firebase app in feature files; reuse shared module exports.
- Use `FieldValue.serverTimestamp()` for server-side timestamp writes.
- Prefer transaction semantics (`adminDb.runTransaction`) for state transitions with contention.

## API Route Checklist

- [ ] Exports `runtime = "nodejs"`.
- [ ] Uses `getSessionUser()` before protected logic.
- [ ] Applies appropriate limiter for endpoint behavior.
- [ ] Validates input before DB writes (for example via `zod`).
- [ ] Uses status codes aligned with `docs/social/API_CONTRACTS.md`.
- [ ] Writes are scoped to authorized user and ownership checks.

## Guardrails

Do:
- Keep Firebase initialization and credential parsing centralized.
- Use per-user limiter keys (`${uid}:<endpoint_key>`).
- Use merge writes intentionally and explicitly.

Do not:
- Import `firebase-admin/*` in client components.
- Bypass auth checks on social/chat/pvp protected routes.
- Introduce new Firestore collections without checking rule/index implications.
- Add endpoint-specific status code semantics that conflict with existing contracts.

## Repo References

- `lib/firebase/client.ts`
- `lib/firebase/admin.ts`
- `lib/auth/server.ts`
- `lib/server/rate-limit.ts`
- `app/api/session/route.ts`
- `app/api/chat/conversations/route.ts`
- `docs/social/API_CONTRACTS.md`
- `README.md`
- `.env.example`

## Validation Before Finishing

- Run lint and ensure route-level imports are context-correct (client vs admin).
- Ensure auth and rate limiting are placed before expensive operations.
- Confirm response codes and error messages match established endpoint patterns.
