# Review Mistakes PRD

## Problem

TenXEng stores quiz explanations and the user's selected answers, but missed questions are currently buried inside recent history. Users can see what they got wrong on a given day, but they cannot revisit mistakes as a focused learning workflow.

## Goal

Turn wrong answers into a reusable review loop that improves learning retention without changing quiz generation, streaks, or leaderboard behavior.

## Target User

Signed-in quiz users who want to learn from prior mistakes instead of only completing the next daily quiz.

## User Story

As a learner, I want a dedicated place to review the questions I missed so I can understand the right answer and improve on weak areas.

## MVP Scope

- Add a dedicated `Review mistakes` experience inside the dashboard.
- Show only incorrectly answered questions from recent completed quizzes.
- Group review content by completed quiz session and let users load older sessions.
- Compress the visible queue into collapsible sections grouped by one primary topic per mistake.
- Let users mark individual mistakes as reviewed so they disappear from the default queue persistently.
- Display enough context to learn from each miss:
  - quiz date
  - question prompt
  - all answer choices
  - user's selected answer
  - correct answer
  - explanation
  - topics when available
- Use existing `quizResults` and `dailyQuizzes` data only.
- Support loading, empty, and error states.

## Out Of Scope

- Generating new practice questions from mistakes
- Spaced repetition or scheduling logic
- Undo / show-reviewed toggle
- Bulk clear actions
- Social sharing, reminders, or notifications
- Changes to daily quiz generation, streak logic, or leaderboard scoring

## Acceptance Criteria

- A signed-in user can open a `Review mistakes` surface from the dashboard.
- The review list contains only questions the user answered incorrectly.
- Each review item shows the user's answer, the correct answer, and the explanation.
- Review items are ordered from most recent quiz activity to older activity.
- Older review sessions can be loaded without losing the current page of review content.
- Visible review items are grouped into collapsible primary-topic sections.
- A user can mark an individual mistake as reviewed and it stays hidden after refresh and future sessions.
- If the user has no wrong answers in the scanned history window, the UI shows a clear empty state.
- The feature works from existing stored quiz data with no backfill job.

## Risks

- Some older `quizResults` entries may exist without the matching `dailyQuizzes` document; those entries should be skipped gracefully.
- The first version depends on recent-result scanning, so it is intentionally not a full historical archive.
- Topic data may be missing or uneven, so the product needs a deterministic fallback topic bucket.
- Reviewed-item filtering must happen server-side or pagination will feel inconsistent.

## Follow-Ups

- Show-reviewed toggle or undo action
- Topic filters beyond primary-topic grouping
- Pagination or deeper history
- Practice-drill generation from prior mistakes
- Spaced repetition cues
