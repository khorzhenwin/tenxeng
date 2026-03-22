# Progress Trends QA

## Core Scenarios

1. Auth and access
- `GET /api/progress-trends` returns `401` without a session.
- An authenticated user receives only their own quiz and practice history.

2. Quiz accuracy trends
- Recent quiz results are returned in chronological order.
- Each point includes date, score, total, and computed accuracy.
- Summary quiz accuracy reflects the recent tracked results.

3. Practice cadence
- Completed practice sessions are grouped by day.
- Each group reports session count and average accuracy.
- Summary practice accuracy reflects completed practice sessions only.

4. Weak-topic signals
- Weak topics are derived from both quiz history and completed practice sessions.
- Topics with lower accuracy rank ahead of stronger topics.
- The latest completion timestamp is preserved for display.

5. Dashboard experience
- `Progress trends` replaces the old `Due today` tab.
- The page clearly distinguishes `Progress trends` from `Mistake inbox`.
- Empty, loading, and error states render without layout breakage.

## Regression Focus

- Existing `Questions`, `Practice`, `Mistake inbox`, `Preferences`, `Leaderboard`, `PvP`, `Social`, and `My Profile` tabs still render.
- Daily quiz submission still records results and refreshes downstream history.
- Practice session creation and submission still work for `weak-topics` and `recent-mistakes`.

## Suggested Test Coverage

- `tests/integration/progress-trends.integration.test.ts`
  - returns `401` without session
  - returns quiz accuracy series and weak topics from quiz history
  - aggregates practice cadence and average accuracy by day
  - uses completed practice performance to surface weak topics

## Manual Verification

- Complete at least two quizzes with different outcomes.
- Complete at least one practice drill.
- Open `Progress trends` and verify summary cards update.
- Verify the recent quiz list shows the correct dates and percentages.
- Verify the practice cadence list groups multiple drills completed on the same day.
- Verify weak topics match the areas you recently missed.
- Confirm `Mistake inbox` still behaves like a recent backlog rather than a second trends page.
