---
name: gemini-question-generation
description: Implement and maintain Gemini-powered question generation in this project using shared prompt, Zod parsing, model configuration, and robustness checks. Use when editing quiz generation, embeddings, Gemini API calls, prompt logic, or related API routes.
---

# Gemini Question Generation

## When To Use

Use this skill for:
- Daily quiz generation changes
- PvP question generation behavior
- Prompt/schema updates
- Gemini model selection/config changes
- Embedding-based novelty checks
- Gemini error handling or retries

## Source Of Truth Files

- `lib/quiz/generate.ts`
- `lib/quiz/embeddings.ts`
- `app/api/daily-quiz/route.ts`
- `app/api/pvp/challenges/[id]/accept/route.ts`
- `app/api/pvp/session/[sessionId]/start/route.ts`
- `app/api/quiz-topics/backfill/route.ts`
- `lib/quiz/types.ts`

## Default Workflow

1. Keep generation logic centralized in `lib/quiz/generate.ts`.
2. Keep embedding logic centralized in `lib/quiz/embeddings.ts`.
3. Route handlers should orchestrate business flow; avoid duplicating prompt/parsing internals inside routes.
4. Parse model output with strict `zod` schemas before mapping to app types.
5. Handle model failures clearly (retry for transient errors, return controlled error responses).

## Implementation Standards

- Require `GEMINI_API_KEY` before model calls.
- Use explicit model names and keep them easy to audit (single source when possible).
- Use `responseMimeType: "application/json"` for structured generation.
- Keep prompt text deterministic and concise; explicitly require JSON output shape.
- Normalize/trim generated strings before persistence.
- Keep generation and embedding model concerns separate.

## Robustness Guardrails

- Add retries with bounded attempts for transient provider failures (`429`, `503`, transport errors).
- Fail fast on schema parse failures with actionable error context.
- Avoid silent fallback to malformed question payloads.
- Keep topic constraints explicit when topic-driven generation is required.
- For novelty checks, keep exact-match and semantic-similarity checks separate and explicit.

## Route Integration Checklist

- [ ] Route authenticates user where required (`getSessionUser()`).
- [ ] Route uses limiter before expensive model work.
- [ ] Route calls shared generation utilities (no duplicated SDK init).
- [ ] Route validates/guards retries to avoid unbounded loops.
- [ ] Route writes generated data with stable shape.
- [ ] Route returns clear non-200 errors on model/parse failures.

## Testing Expectations

- Add or update integration tests when route behavior changes.
- Add unit tests for parsing/mapping logic when schema shape changes.
- Mock `generateSystemDesignQuiz` in integration tests when testing unrelated endpoint behavior.
- Verify deterministic expectations for question count, choice count, and answer index bounds.

## Anti-Patterns

Do not:
- Instantiate ad-hoc Gemini clients in many route files for the same workflow.
- Parse unvalidated model output directly into Firestore writes.
- Hardcode unrelated model constants in multiple places without a migration path.
- Ship prompt updates without checking downstream schema assumptions.

## Repo-Specific Notes

- Daily quiz flow adds novelty filtering with embeddings and bounded retries.
- PvP async accept currently generates questions at accept time.
- Topic backfill uses Gemini separately; keep this behavior intentionally distinct from quiz generation logic.

## Validation Before Finishing

- Ensure all changed Gemini flows still produce valid quiz/question shapes.
- Ensure route handlers maintain expected status code behavior.
- Run relevant tests and lint checks for changed files.
