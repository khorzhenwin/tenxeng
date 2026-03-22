# Review Mistakes QA Plan

## Scope

Validate that the new review workflow correctly exposes missed quiz questions as a recent inbox without regressing the existing daily quiz experience.

## Primary Checks

1. Auth
- Unauthenticated requests to `GET /api/quiz-review` return `401`.

2. Happy path
- A user with completed quizzes and wrong answers receives review items.
- The first page returns recent review sessions plus a cursor when older sessions exist.
- Each item includes date, prompt, choices, selected answer, correct answer, explanation, topics when present, and a deterministic primary topic.
- Items are ordered from newer quiz activity to older activity.
- Loading older sessions appends the next page in descending date order.
- Visible review items are grouped into collapsible topic sections.
- The UI makes it clear that this surface is the recent mistake inbox, while `Progress trends` handles historical improvement signals.

3. Reviewed-state persistence
- Marking an individual item as reviewed removes it from the default queue.
- Refreshing or reloading keeps the item hidden.
- Reviewed filtering is user-scoped and does not affect another user.

4. Empty state
- A user with no wrong answers receives an empty `sessions` array.
- The dashboard shows a friendly empty state instead of a blank panel.

5. Missing-data resilience
- If a `quizResults` document exists but the matching `dailyQuizzes` document is missing, the route skips that entry and still returns `200`.

## Regression Focus

- Existing `Questions`, `Progress trends`, `Preferences`, `Leaderboard`, `PvP`, `Social`, and `My Profile` tabs still render.
- Daily quiz submission flow is unchanged.
- Existing review data remains user-scoped and does not leak across accounts.

## Suggested Test Coverage

- `tests/integration/quiz-review.integration.test.ts`
  - returns paginated review sessions for wrong answers
  - returns `401` without session
  - persists reviewed mistakes and hides them from future GETs
  - keeps reviewed state scoped to the current user
  - returns empty list when all answers are correct
  - skips missing quiz documents gracefully
  - rejects invalid cursors
  - rejects invalid reviewed-item payloads

## Manual Verification

- Complete at least one quiz with a wrong answer.
- Open `Mistake inbox` and verify the queue is grouped into topic sections.
- Expand a topic section and verify the incorrect choice is highlighted separately from the correct choice.
- Clear an item from the inbox and verify it disappears immediately.
- Refresh and verify the reviewed item stays hidden.
- Verify the explanation matches the stored question.
- Verify the page copy makes the difference between `Mistake inbox` and `Progress trends` obvious.
- Verify users with no mistakes see the empty state copy.

## Ship Criteria

- Acceptance criteria from `PRD.md` are met.
- Integration tests pass.
- No new lint errors remain in touched files.
- Residual limitations are documented as follow-up scope, not hidden defects.
