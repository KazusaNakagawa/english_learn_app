# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

**The repository guidance lives in [CLAUDE.md](./CLAUDE.md). Read it first.**

It is the single source of truth for the repository overview, build and deploy
commands, architecture, data model, configuration files, development workflow,
and security notes. Everything there applies to Codex unchanged — nothing in
this repository is agent-specific.

This file is deliberately a pointer rather than a copy. The two used to be
duplicated verbatim, which meant an edit to one silently left the other stale.

## Codex-specific assets

| Path | Purpose |
| ---- | ------- |
| `.agents/skills/` | Project-scoped skills for Codex |

Skills that are not Codex-specific live in `.claude/skills/` or in the global
dotfiles; see [CLAUDE.md](./CLAUDE.md) for the project conventions they follow.
