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
