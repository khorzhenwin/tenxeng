# Progress Trends Implementation

## Files

- `app/api/progress-trends/route.ts`
- `lib/quiz/progress-trends.ts`
- `lib/quiz/practice.ts`
- `lib/quiz/types.ts`
- `app/dashboard/page.tsx`
- `lib/store/ui.ts`
- `tests/integration/progress-trends.integration.test.ts`

## Backend

- Add `getProgressTrends(uid)` in `lib/quiz/progress-trends.ts`.
- Read recent `quizResults` and map them into chronological accuracy points.
- Read recent completed `practiceSessions`, group them by local date, and compute daily cadence plus average accuracy.
- Reuse `getWeakTopicSignals(uid)` from `lib/quiz/practice.ts` for the weak-topic panel instead of adding a second scoring system.
- Expose the payload through `GET /api/progress-trends`.
- Apply `consumeRateLimit()` to the trends route.

## Shared Types

- Remove `SpacedRepetition*` types and the `scheduled-topic` practice source from `lib/quiz/types.ts`.
- Add shared response types for:
  - quiz trend points
  - practice trend points
  - weak-topic signals
  - progress trends summary payload

## Dashboard

- Replace the `Due today` tab with `Progress trends` in `lib/store/ui.ts`.
- Remove the old due-queue fetch, mutation, and card-expansion state from `app/dashboard/page.tsx`.
- Fetch `GET /api/progress-trends` when the trends tab opens.
- Render:
  - summary cards
  - recent quiz accuracy list
  - recent practice cadence list
  - weak-topic cards with direct follow-up CTAs
- Keep the copy explicit:
  - `Mistake inbox` is the recent backlog
  - `Progress trends` is the improvement view

## Cleanup

- Remove `app/api/spaced-repetition/route.ts`.
- Remove `lib/quiz/spaced-repetition.ts`.
- Remove the old spaced-repetition feature packet and test file.
- Strip spaced-repetition sync hooks from quiz and practice result routes.

## Definition Of Done

- No production code imports the old spaced-repetition module.
- The dashboard has no `Due today` tab or scheduled-review copy.
- Integration coverage verifies route auth, quiz-series aggregation, practice-series aggregation, and practice-driven weak-topic signals.
- Lint, typecheck, and targeted integration tests pass.
