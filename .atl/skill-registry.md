# Skill Registry

Project: `NexusCLI`
Generated: 2026-03-20
Resolution order: project-level overrides user-level by skill name.

## Registered Skills

| Skill | Source | Path | Trigger / Usage |
|---|---|---|---|
| prd | project | `/home/tomas/Proyectos/NexusCLI/.agents/skills/prd/SKILL.md` | Crear PRDs y documentación de requerimientos de producto. |
| find-skills | user | `/home/tomas/.agents/skills/find-skills/SKILL.md` | Descubrir/instalar skills cuando el usuario pide nuevas capacidades. |
| go-testing | user | `/home/tomas/.config/opencode/skills/go-testing/SKILL.md` | Testing en Go y Bubbletea TUI. |
| skill-creator | user | `/home/tomas/.config/opencode/skills/skill-creator/SKILL.md` | Crear nuevas skills para agentes. |

## Excluded by Policy

- `sdd-*` skills excluded from registry list (phase/internal workflow skills).
- `_shared` excluded.
- `skill-registry` excluded.

## Project Convention Files (root scan)

No project-level convention files found in root:

- `agents.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.cursorrules`
- `GEMINI.md`
- `copilot-instructions.md`

## Notes

- Project has `skills-lock.json` with `prd` locked from `github/awesome-copilot`.
- Project contains `.agent/skills/` and `.agents/skills/`; active project skill detected in `.agents/skills/prd`.
