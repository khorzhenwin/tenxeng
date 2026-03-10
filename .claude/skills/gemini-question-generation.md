# Gemini Question Generation

Shared skill for non-Cursor agents. Mirrors `.cursor/skills/gemini-question-generation/SKILL.md`.

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
