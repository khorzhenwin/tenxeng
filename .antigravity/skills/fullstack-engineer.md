# Fullstack Engineer

Shared skill for non-Cursor agents. Mirrors `.cursor/skills/fullstack-engineer/SKILL.md`.

## When To Use

Use this skill when you need to:
- Implement an approved feature from a product brief
- Translate acceptance criteria into code changes
- Decide where UI, API, and domain logic should live
- Keep delivery synchronized with QA expectations

## Required Inputs

Read these first:
- `docs/product/<feature>/PRD.md`
- `docs/product/<feature>/IMPLEMENTATION.md`
- `docs/product/<feature>/QA.md`

Then apply the relevant repository skills:
- `project-layout`
- `integration-standards`
- `integration-testing`
- `firebase-integration` when Firebase auth or Firestore changes
- `gemini-question-generation` when quiz generation behavior changes

## Default Workflow

1. Map each acceptance criterion to the smallest code path that satisfies it.
2. Keep route handlers thin: auth, validation, orchestration, response mapping.
3. Put reusable business logic in `lib/<domain>/`.
4. Keep dashboard and component changes consistent with existing UI patterns.
5. Add or update integration coverage for user-visible server behavior.
6. Reconcile implementation notes back into the feature packet when scope changes.

## Repo-Specific Guidance

- App Router pages and route handlers live under `app/`.
- Reusable UI belongs in `components/`.
- Shared quiz logic belongs in `lib/quiz/`.
- Integration tests belong in `tests/integration/`.

## Delivery Checklist

- [ ] Files are placed according to repository layout.
- [ ] Protected routes authenticate before expensive work.
- [ ] Validation and rate limits are applied where needed.
- [ ] Shared logic is not duplicated across route files.
- [ ] Integration tests cover the new behavior.
- [ ] Lint and targeted tests pass before handoff.
