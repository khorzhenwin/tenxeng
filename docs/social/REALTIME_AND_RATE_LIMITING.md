# Realtime and Polling Governance

## Strategy
- Keep Firestore as source of truth.
- Use API-driven polling for MVP chat and social inbox states.
- Reserve Firestore snapshot listeners for future optimization.

## Polling Cadence (MVP)
- Social panel refresh: every 20 seconds.
- Chat panel conversation/message refresh: every 4 seconds while open.
- PvP session polling: existing 5-second cadence.

## Rate Limiting
- Enforced by in-memory limiter at `lib/server/rate-limit.ts`.
- Each social/chat endpoint uses a per-user key.
- Requests above 1 request/second return `429`.
- Classification:
  - not token bucket (no token store/refill/burst semantics),
  - not leaky bucket (no queue + drain),
  - closest to strict minimum inter-arrival time throttling.

## Notes
- In-memory limiting is best-effort for single runtime instance.
- For horizontal scale, replace with Redis/shared limiter.
