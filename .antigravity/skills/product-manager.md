# Product Manager

Shared skill for non-Cursor agents. Mirrors `.cursor/skills/product-manager/SKILL.md`.

## When To Use

Use this skill when you need to:
- Review product gaps before coding
- Turn ideas into testable requirements
- Define MVP scope and non-goals
- Keep PM, engineering, and QA aligned on one feature packet

## Default Workflow

1. Inspect product context in `README.md`, relevant docs, and current UI/API entry points.
2. Write the user problem, target user, and why the feature matters now.
3. Lock MVP scope, explicit non-goals, and rollout risks before implementation.
4. Create or update the shared feature packet under `docs/product/<feature>/`:
   - `PRD.md`
   - `IMPLEMENTATION.md`
   - `QA.md`
5. Keep acceptance criteria observable in UI, API, or persisted data.
6. Hand off one source of truth to engineering and QA; avoid parallel requirement versions.

## Required Deliverables

- `PRD.md`: problem statement, goals, non-goals, user stories, MVP scope, acceptance criteria, rollout notes

## Synchronization Rules

- Use one stable feature name/path across docs, code, and tests.
- If scope changes, update `PRD.md` first, then `IMPLEMENTATION.md` and `QA.md` in the same change.
- Keep acceptance criteria concise and testable.

## Repo-Specific Guidance

- Core product shell lives in `app/dashboard/page.tsx`.
- Route handlers live in `app/api/**/route.ts`.
- Reusable business logic belongs in `lib/**`.
- Feature packet docs for this workflow belong in `docs/product/`.

## Handoff Checklist

- [ ] User problem is explicit.
- [ ] MVP and out-of-scope work are separated.
- [ ] Acceptance criteria are observable.
- [ ] Engineering entry points are named.
- [ ] QA scenarios and rollout risks are captured.
