# Async Friend Challenge Implementation Checklist

## Objective

Allow friend challenges to be completed asynchronously so each player can start and submit independently, without blocking on live opponent presence.

## Phase 1 - Backend foundation

- [ ] Extend social challenge model with `mode` and `asyncMatchId`.
- [ ] Add async match domain type (`asyncPvpMatches` collection shape).
- [ ] Extract shared PvP scoring/winner/history builders into reusable utilities.
- [ ] Update challenge create API to accept challenge mode.
- [ ] Update challenge accept API to branch:
  - sync mode -> existing `pvpSessions` behavior
  - async mode -> create `asyncPvpMatches` behavior
- [ ] Add async match APIs:
  - `GET /api/pvp/async/[matchId]`
  - `POST /api/pvp/async/[matchId]/start`
  - `POST /api/pvp/async/[matchId]/submit`

### Phase 1 acceptance criteria

- Async challenge acceptance creates an async match with shared questions.
- First player can submit without waiting for second player.
- Match resolves winner once both submissions are present.
- Both users get history entries after resolution.

## Phase 2 - UI and user flow

- [ ] Add challenge mode selector in Social panel.
- [ ] Route accepted async challenge to async match flow (not sync session flow).
- [ ] Add async match UI state in PvP panel:
  - start run
  - submit run
  - pending opponent status
  - final result when both completed
- [ ] Keep existing sync PvP flow unchanged.

### Phase 2 acceptance criteria

- No blocking "waiting for opponent" screen for async mode.
- Users can leave and come back to pending async matches.
- Sync mode remains functional and regression-free.

## Phase 3 - persistence hardening

- [ ] Add Firestore rules for `asyncPvpMatches` participant-only access.
- [ ] Add required indexes for async inbox and participant queries.
- [ ] Add expiration handling for stale async matches.
- [ ] Add notifications for:
  - async challenge accepted
  - opponent submitted
  - async match completed

### Phase 3 acceptance criteria

- Async reads/writes obey auth and participant boundaries.
- Query latency remains acceptable with indexes.
- Expired challenges and matches are clearly represented in UI.

## Phase 4 - quality and rollout

- [ ] Add integration tests for async challenge flow.
- [ ] Add mixed-mode tests (sync and async side-by-side).
- [ ] Roll out behind feature flag, then make async default for friend challenges.

### Phase 4 acceptance criteria

- CI passes integration coverage for async and sync paths.
- Async mode can be enabled safely without breaking current matches.
