# Social MVP PRD

## Goal
Ship a friend network loop that increases repeat user interaction with three connected features:
- friend request flow
- friend-to-friend PvP challenge flow
- messenger-style direct chat

## User Stories
- As a user, I can send friend requests and accept or decline incoming requests.
- As a user, I can challenge accepted friends to a PvP session.
- As a user, I can message accepted friends from a persistent chat bubble.

## MVP Scope
- Friend request lifecycle: pending, accepted, declined, cancelled.
- Friend management: list, remove, block, unblock.
- Challenge lifecycle: pending, accepted/declined, accepted creates PvP session.
- Chat lifecycle: create/find DM conversation, send messages, read/unread counts.
- Dashboard social surface and floating chat bubble.

## Out of Scope
- Group chat and clubs.
- Push notifications.
- Typing indicators and read receipts UI.
- Media/file message types.

## Acceptance Criteria
- Users can send requests and cannot send duplicate pending requests.
- Only request recipient can accept/decline; only sender can cancel.
- Accepted requests create a friendship relation.
- Users can challenge friends and receive challenge inbox entries.
- Accepting a challenge creates a PvP session and opens PvP flow.
- Users can open DM with friends and exchange messages in the chat bubble.
- Polling intervals stay above 1 second and server enforces 1 RPS cap per endpoint key.
- Blocked relationships prevent requests, challenges, and DM creation.
