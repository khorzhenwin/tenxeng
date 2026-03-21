# Adaptive Practice Drills Implementation

## Objective

Ship a new on-demand practice mode powered by the existing quiz-generation stack, while also tightening semantic novelty filtering for both daily quizzes and practice drills.

## Planned Touchpoints

- `app/api/practice-quiz/route.ts`
- `app/api/practice-result/route.ts`
- `lib/quiz/practice.ts`
- `lib/quiz/generate.ts`
- `lib/quiz/embeddings.ts`
- `lib/quiz/types.ts`
- `app/api/daily-quiz/route.ts`
- `lib/store/ui.ts`
- `app/dashboard/page.tsx`
- `tests/integration/practice.integration.test.ts`

## Data Sources

- `users/{uid}/quizResults/{dateKey}`
- `users/{uid}/dailyQuizzes/{dateKey}`
- `users/{uid}/questionHistory/{historyId}`
- `users/{uid}/reviewedMistakes/{itemId}`
- `users/{uid}/practiceSessions/{sessionId}`

## API Contract

### `POST /api/practice-quiz`

Request:

```json
{
  "sourceType": "weak-topics"
}
```

Response:

```json
{
  "session": {
    "id": "session-id",
    "sourceType": "weak-topics",
    "topics": ["Caching", "Scalability"],
    "status": "ready",
    "createdAt": "2026-03-21T12:00:00.000Z",
    "questions": []
  }
}
```

### `GET /api/practice-quiz?limit=<n>`

Returns recent practice sessions ordered by `createdAt` descending.

### `POST /api/practice-result`

Request:

```json
{
  "sessionId": "session-id",
  "selectedAnswers": {
    "question-id": 1
  }
}
```

## Implementation Notes

- Authenticate practice routes with `getSessionUser()`.
- Apply `consumeRateLimit()` before expensive generation and write behavior.
- Keep topic-derivation and practice orchestration in `lib/quiz/practice.ts`.
- Store practice state separately from `dailyQuizzes` and `quizResults`.
- Mark completed practice sessions on the stored session document rather than mixing with daily result data.
- Reuse the shared generation utility from `lib/quiz/generate.ts`.

## Novelty Hardening

- Move semantic novelty behavior toward shared quiz infrastructure instead of keeping it daily-route-specific.
- Lower the semantic similarity threshold from the current daily-quiz behavior.
- Make same-topic overlap more sensitive than different-topic overlap.
- Continue exact-match prompt blocking and bounded retries.
- Reuse the same novelty logic for daily quizzes and practice drills.

## UI Notes

- Add a `Practice` tab in the dashboard.
- Show two clear launch actions:
  - `Practice weak topics`
  - `Practice recent mistakes`
- Reuse existing quiz answer/result rendering patterns where possible.
- Add a practice history section for completed drills.
- Keep practice visually distinct from the daily quiz and Review Mistakes.

## Non-Goals

- No leaderboard writes for practice
- No streak updates for practice
- No Gemini usage outside the shared quiz-generation path
- No major dashboard route split in this iteration

## Definition Of Done

- Practice drills can be created, completed, and revisited.
- Practice state is persisted separately from daily quiz state.
- Daily streak and leaderboard behavior remain unchanged.
- Novelty filtering is stricter and reused by both daily and practice generation.
- Integration tests, lint, and typecheck all pass.
