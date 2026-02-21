# Social API Contracts

## Friends
- `GET /api/friends`
  - returns `friends`, `incomingRequests`, `outgoingRequests`, `blocks`
- `POST /api/friends/request`
  - body: `{ "targetUid": "string" }`
- `POST /api/friends/request/{id}/accept`
- `POST /api/friends/request/{id}/decline`
- `POST /api/friends/request/{id}/cancel`
- `POST /api/friends/{uid}/remove`
- `POST /api/friends/{uid}/block`
  - body: `{ "action": "block" | "unblock" }`

## User discovery
- `GET /api/users/search?q=<query>`
- `GET /api/users/{uid}`

## Challenges
- `GET /api/pvp/challenges/inbox`
  - returns `incoming`, `outgoing`
- `POST /api/pvp/challenges`
  - body: `{ "challengedUid": "string" }`
- `POST /api/pvp/challenges/{id}/accept`
  - returns `{ "sessionId": "string" }`
- `POST /api/pvp/challenges/{id}/decline`

## Chat
- `GET /api/chat/conversations`
  - returns `conversations`, `members`
- `POST /api/chat/conversations`
  - body: `{ "targetUid": "string" }`
  - returns `{ "conversationId": "string" }`
- `GET /api/chat/conversations/{id}/messages?limit=60`
- `POST /api/chat/conversations/{id}/messages`
  - body: `{ "body": "string" }`
- `POST /api/chat/conversations/{id}/read`

## Status Codes
- `401`: missing/invalid session.
- `403`: forbidden due to ownership, friendship, or block checks.
- `404`: target entity missing.
- `409`: invalid state transition (already pending, already processed, etc.).
- `429`: rate limit triggered.
