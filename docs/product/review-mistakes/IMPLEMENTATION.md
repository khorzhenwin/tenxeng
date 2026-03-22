# Review Mistakes Implementation

## Objective

Ship a first vertical slice that derives missed-question review cards from existing quiz result data and surfaces them as a recent mistake inbox in the dashboard.

## Planned Touchpoints

- `app/api/quiz-review/route.ts`
- `lib/quiz/review.ts`
- `lib/quiz/types.ts`
- `lib/store/ui.ts`
- `app/dashboard/page.tsx`
- `tests/integration/quiz-review.integration.test.ts`

## Data Sources

- `users/{uid}/quizResults/{dateKey}`
- `users/{uid}/dailyQuizzes/{dateKey}`
- `users/{uid}/reviewedMistakes/{itemId}`

## API Contract

### `GET /api/quiz-review?limit=<n>`

Response shape:

```json
{
  "sessions": [
    {
      "dateKey": "20260321",
      "completedAt": "2026-03-21T09:00:00.000Z",
      "score": 3,
      "total": 5,
      "mistakeCount": 2,
      "items": [
        {
          "id": "20260321:q1",
          "dateKey": "20260321",
          "completedAt": "2026-03-21T09:00:00.000Z",
          "questionId": "q1",
          "primaryTopic": "Caching",
          "prompt": "Question text",
          "choices": ["A", "B", "C", "D"],
          "selectedAnswerIndex": 0,
          "selectedAnswer": "A",
          "correctAnswerIndex": 2,
          "correctAnswer": "C",
          "explanation": "Why C is correct",
          "topics": ["Caching"]
        }
      ]
    }
  ],
  "nextCursor": "2026-03-21T09:00:00.000Z"
}
```

### `POST /api/quiz-review`

Request body:

```json
{
  "itemId": "20260321:q1"
}
```

## Implementation Notes

- Authenticate with `getSessionUser()` before reading user data.
- Apply `consumeRateLimit()` to read and write review endpoints.
- Validate `limit` from the query string and clamp it to a safe range.
- Validate `itemId` before persisting reviewed state.
- Keep aggregation logic in `lib/quiz/review.ts`, not inside the route.
- Scan recent quiz results, join to `dailyQuizzes`, derive only wrong-answer cards, filter reviewed items server-side, group them by quiz session, then return a capped page of sessions plus a cursor for older sessions.
- Persist reviewed mistakes by `QuizReviewItem.id` in a user-scoped subcollection.
- Derive one `primaryTopic` per mistake using the first topic in the item, with `Uncategorized` as fallback.
- Skip malformed or missing quiz documents gracefully instead of failing the whole request.

## UI Notes

- Add a `Mistake inbox` tab to the dashboard navigation.
- Load review sessions only when the review tab is active.
- Support `Load older sessions` pagination in the dashboard UI.
- Flatten visible items into collapsible primary-topic sections for a more compact review queue.
- Add a `Clear from inbox` action on each mistake card and remove it from the visible queue after success.
- Reuse the current visual language from quiz history cards:
  - green for correct answer
  - rose for the user's wrong answer
- Provide loading, empty, and error states.
- Add copy that explicitly distinguishes the recent inbox from the performance-oriented `Progress trends` view.
- Keep v1 focused on review only; no retry, regenerate, note-taking, or undo flow.

## Non-Goals

- No Gemini usage
- No dashboard route split or major refactor

## Definition Of Done

- The route returns only incorrectly answered questions.
- Reviewed items are persistently hidden from subsequent review loads.
- The dashboard exposes grouped review topics and renders the contract cleanly.
- Integration tests cover success and guardrail behavior.
- Lint and targeted tests pass.
