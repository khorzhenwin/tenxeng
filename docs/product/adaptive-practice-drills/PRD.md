# Adaptive Practice Drills PRD

## Problem

TenXEng helps users identify weak areas through the daily quiz, profile stats, and Review Mistakes, but it still lacks an active way to practice those weaknesses on demand. Users can see what they got wrong, yet they cannot immediately turn that feedback into a targeted learning session.

There is also a quality issue in the current quiz-generation loop: users still receive semantically similar questions on topics they have already answered before, especially around repeated topic clusters. That weakens trust in the learning experience.

## Goal

Expand TenXEng from a daily-quiz and review product into an active targeted-practice product by introducing on-demand drills and stronger novelty filtering.

## Target User

Signed-in learners who want to practice beyond the daily quiz and focus on weak or recently missed system-design topics.

## User Stories

- As a learner, I want to start a targeted practice drill based on my weak topics so I can improve where I struggle most.
- As a learner, I want to start a drill based on recent mistakes so I can immediately reinforce concepts I recently missed.
- As a learner, I want practice sessions to stay separate from the daily quiz so I can experiment and learn without affecting my streak or leaderboard standing.
- As a learner, I want the product to avoid semantically repetitive questions so practice feels fresh and worthwhile.

## MVP Scope

- Add a dedicated `Practice` experience inside the dashboard.
- Support two drill sources:
  - `Practice weak topics`
  - `Practice recent mistakes`
- Generate a 5-question AI-backed practice drill with explanations.
- Allow users to submit answers and see results.
- Save practice session history separately from the daily quiz flow.
- Keep practice session data separate from streak and leaderboard calculations.
- Improve novelty filtering so repeated-topic questions are blocked more aggressively than today.

## Out Of Scope

- Practice leaderboard or streak integration
- PvP practice mode
- Spaced repetition scheduling
- Difficulty tuning UI
- Social sharing of practice sessions
- Undo/redo for completed practice sessions

## Acceptance Criteria

- A signed-in user can open a `Practice` surface from the dashboard.
- A user can generate a practice drill from weak topics.
- A user can generate a practice drill from recent mistakes.
- A generated drill contains valid quiz questions with explanations.
- A user can submit a practice drill and receive a score.
- Practice sessions are persisted separately from daily quiz results.
- Daily streaks and weekly leaderboard results are unchanged by practice activity.
- The novelty filter is stricter for semantically similar same-topic questions than the current daily quiz behavior.

## Risks

- Practice generation introduces more Gemini and embedding calls, so latency and cost need rate limiting and bounded retries.
- Practice and daily quiz data must remain clearly separated or users may lose trust in streaks and competition.
- Stricter novelty filtering may increase retries; the system needs sensible fallbacks and bounded behavior.

## Follow-Ups

- Practice history filters
- Recommended drill length or difficulty selection
- Spaced repetition scheduling
- Practice progress trends by topic
