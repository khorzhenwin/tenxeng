# Realtime and Polling Governance

## Strategy
- Keep Firestore as source of truth.
- Use API-driven polling for MVP chat and social inbox states.
- Reserve Firestore snapshot listeners for future optimization.

## Polling Cadence (MVP)
- Social panel refresh: every 20 seconds.
- Chat panel conversation/message refresh: every 5 seconds while open.
- PvP session polling: existing 5-second cadence.

## Rate Limiting
- Polling endpoints (`chat_conversations_get`, `chat_messages_get`, `chat_typing_get`, `notifications_get`)
  use a Firestore-backed sliding-window counter at `lib/server/rate-limit.ts`.
- Each social/chat endpoint uses a per-user key.
- Sliding-window policy for polling keys: 15 requests / 10 seconds.
- Classification:
  - not token bucket (no token balance/refill),
  - not leaky bucket (no queue + drain),
  - not fixed spacing gate (multiple requests allowed within the window up to limit),
  - is sliding-window counter.

## Notes
- Other non-polling endpoints still use the in-memory timestamp gate limiter.
- Firestore-backed polling limits are shared across instances.
