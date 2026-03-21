# QA Engineer

Shared skill for non-Cursor agents. Mirrors `.cursor/skills/qa-engineer/SKILL.md`.

## When To Use

Use this skill when you need to:
- Turn acceptance criteria into a test plan
- Review a feature for regressions or missing coverage
- Add or expand integration tests
- Decide whether a feature is ready to ship

## Required Inputs

Read these first:
- `docs/product/<feature>/PRD.md`
- `docs/product/<feature>/IMPLEMENTATION.md`
- `docs/product/<feature>/QA.md`

Then use:
- `integration-testing`
- `integration-standards`
- Any domain skill referenced by the implementation

## Default Workflow

1. Map each acceptance criterion to one or more checks.
2. Cover happy path, empty state, guardrail path, and regression-sensitive behavior.
3. Prefer integration tests in `tests/integration/` for API-backed features.
4. Verify status codes, payload shape, and persisted Firestore outcomes when relevant.
5. Run lint and the relevant test suite before signoff.
6. Summarize blockers first, then residual risks, then what was verified.

## Repo-Specific Guidance

- Auth is typically mocked with `setAuthedUser(...)` in integration tests.
- Route handlers are invoked directly with `Request` objects.
- Firestore emulator data should be cleared between tests.
- Keep status-code expectations aligned with shared API semantics.

## Signoff Checklist

- [ ] Acceptance criteria are covered.
- [ ] Empty and error states were checked.
- [ ] Relevant regressions were considered.
- [ ] Tests are deterministic.
- [ ] Lint/test commands were run or any gaps were called out explicitly.
