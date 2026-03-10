# Skills Registry (Canonical Source)

This file is the repo-level canonical source for agent skills used across:
- `.cursor/skills/`
- `.claude/skills/`
- `.antigravity/skills/`

## Canonical Rule

- Canonical definitions live in `.cursor/skills/*/SKILL.md`.
- Mirrors for other agent ecosystems must stay semantically equivalent:
  - `.claude/skills/*.md`
  - `.antigravity/skills/*.md`
- When a skill is added/updated/removed, update all three ecosystems in the same change.

## Active Skills

1. `firebase-integration`
2. `gemini-question-generation`
3. `integration-standards`
4. `integration-testing`
5. `project-layout`

## File Mapping

- `firebase-integration`
  - Cursor: `.cursor/skills/firebase-integration/SKILL.md`
  - Claude: `.claude/skills/firebase-integration.md`
  - Antigravity: `.antigravity/skills/firebase-integration.md`

- `gemini-question-generation`
  - Cursor: `.cursor/skills/gemini-question-generation/SKILL.md`
  - Claude: `.claude/skills/gemini-question-generation.md`
  - Antigravity: `.antigravity/skills/gemini-question-generation.md`

- `integration-standards`
  - Cursor: `.cursor/skills/integration-standards/SKILL.md`
  - Claude: `.claude/skills/integration-standards.md`
  - Antigravity: `.antigravity/skills/integration-standards.md`

- `integration-testing`
  - Cursor: `.cursor/skills/integration-testing/SKILL.md`
  - Claude: `.claude/skills/integration-testing.md`
  - Antigravity: `.antigravity/skills/integration-testing.md`

- `project-layout`
  - Cursor: `.cursor/skills/project-layout/SKILL.md`
  - Claude: `.claude/skills/project-layout.md`
  - Antigravity: `.antigravity/skills/project-layout.md`

## Maintenance Checklist

- [ ] Skill name uses lowercase kebab-case.
- [ ] Cursor `SKILL.md` updated first.
- [ ] Claude and Antigravity mirrors updated in same commit.
- [ ] `.claude/skills/README.md` and `.antigravity/skills/README.md` still list all active skills.
- [ ] This registry reflects current mapping and skill set.
