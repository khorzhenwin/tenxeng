# Adaptive Practice Drills QA Plan

## Scope

Validate that the new practice workflow creates targeted drills safely, stores them separately from the daily quiz loop, and improves novelty filtering without regressing current quiz behavior.

## Primary Checks

1. Auth
- Unauthenticated requests to practice routes return `401`.

2. Practice creation
- A user can create a drill from `weak-topics`.
- A user can create a drill from `recent-mistakes`.
- Returned sessions include valid question payloads and source topics.

3. Practice submission
- A user can submit a practice session and receive a score.
- The session status changes to `completed`.
- Practice submission does not write to `quizResults` or leaderboard entries.

4. Practice history
- Completed practice sessions appear in history ordered newest first.
- Sessions remain separate from daily quiz history.

5. Novelty behavior
- Semantic novelty filtering still rejects exact prompt duplicates.
- Same-topic near-duplicates are rejected more aggressively than before.
- Bounded retries remain in place and the route still returns a valid controlled response.

## Regression Focus

- Existing daily quiz generation still works.
- Existing Review Mistakes behavior still works.
- Existing leaderboard and streak behavior remain unchanged.
- Existing social, PvP, and chat integrations continue to pass.

## Suggested Test Coverage

- `tests/integration/practice.integration.test.ts`
  - creates practice session from weak topics
  - creates practice session from recent mistakes
  - submits practice results successfully
  - keeps practice writes out of `quizResults`
  - returns `401` when unauthenticated
  - validates bad payloads cleanly

## Manual Verification

- Start a practice drill from each source type.
- Complete a practice drill and verify explanations are visible.
- Confirm the session appears in practice history.
- Confirm daily quiz streak/leaderboard values do not change after practice.
- Repeat practice generation and check that obviously repeated same-topic questions are reduced.

## Ship Criteria

- Acceptance criteria from `PRD.md` are met.
- Integration tests pass.
- No new lint or type errors remain.
- Residual limitations are documented as follow-up scope, not hidden defects.
