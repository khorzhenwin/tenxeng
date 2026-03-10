# Firebase Integration

Shared skill for non-Cursor agents. Mirrors `.cursor/skills/firebase-integration/SKILL.md`.

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

## Integration Standards

- Import Firebase client SDK only from `@/lib/firebase/client` in browser code.
- Import Admin SDK only from `@/lib/firebase/admin` in server code.
- Do not initialize Firebase app in feature files; reuse shared module exports.
- Use `FieldValue.serverTimestamp()` for server-side timestamp writes.
- Prefer transaction semantics (`adminDb.runTransaction`) for state transitions with contention.
