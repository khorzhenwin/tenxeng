# Progress Trends PRD

## Problem

`Due today` overlapped too heavily with `Mistake inbox`. Both surfaces revolved around earlier mistakes, so users had to parse product wording to understand why two tabs existed at all.

## Goal

Replace the old schedule-driven queue with a learning analytics surface that answers a different question:

- `Mistake inbox` shows what you missed recently.
- `Practice` lets you act on that signal right away.
- `Progress trends` shows whether the user is actually improving over time.

## User Value

- Make learning momentum visible without adding a second review queue.
- Show whether recent quiz accuracy is trending up or down.
- Show whether the user is building a real practice habit.
- Surface weak topics using existing quiz and practice history.

## Scope

- Add a dedicated `Progress trends` tab in the dashboard.
- Show summary cards for tracked quizzes, completed practice sessions, quiz accuracy, and practice accuracy.
- Show a recent quiz accuracy series.
- Show a recent practice cadence series grouped by day.
- Show the current weakest topics from recent quiz and practice performance.
- Reuse existing `quizResults`, `dailyQuizzes`, and `practiceSessions` data only.

## Out Of Scope

- New persistence tables or background jobs.
- Predictive coaching, reminders, or streak nudges.
- Exporting history or long-term cohort analytics.
- Custom date ranges for v1.

## Acceptance Criteria

- A signed-in user can open `Progress trends` from the dashboard.
- The surface loads from existing stored quiz and practice data with no migration.
- Quiz accuracy points are shown in chronological order from recent history.
- Practice cadence is grouped by date using the user timezone.
- Weak topics reflect combined quiz and practice performance rather than quiz-only history.
- Empty, loading, and error states are handled.
- The copy makes it obvious that `Progress trends` is distinct from `Mistake inbox`.

## Risks

- Thin history may make trends feel sparse, so the empty state must explain what data will appear.
- Recent quiz and practice activity can be skewed toward only a few topics; the UI should frame weak topics as signals, not absolute judgments.
