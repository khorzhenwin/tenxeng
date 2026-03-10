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
