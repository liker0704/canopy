# Tane

Git-native prompt management for AI agent workflows. Minimal dependencies, JSONL storage, Bun runtime.

## Quick Reference

- **Runtime:** Bun (TypeScript)
- **Storage:** JSONL files (one per record type)
- **CLI prefix:** `ta`
- **Spec:** See `SPEC.md` for full design

## Project Structure

```
.tane/           # On-disk data (prompts.jsonl, schemas.jsonl, config.yaml)
src/               # Source code (Bun/TypeScript)
SPEC.md            # Detailed specification
```

## Conventions

- Minimal runtime dependencies — chalk + commander only
- Concurrent-safe: advisory file locks + atomic writes
- Git-native: JSONL is diffable/mergeable, `merge=union` gitattribute
- All CLI commands support `--json` flag
- Prompts are composed via sections and inheritance, not duplicated
- `ta emit` renders to plain `.md` (or `.ts` when `emitAs` ends in `.ts`) for downstream consumption

<!-- mulch:start -->
## Project Expertise (Mulch)

This project uses [Mulch](https://github.com/jayminwest/mulch) for structured expertise management.

**At the start of every session**, run:
```bash
mulch prime
```

This injects project-specific conventions, patterns, decisions, and other learnings into your context.
Use `mulch prime --files src/foo.ts` to load only records relevant to specific files.

**Before completing your task**, review your work for insights worth preserving — conventions discovered,
patterns applied, failures encountered, or decisions made — and record them:
```bash
mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
```

Link evidence when available: `--evidence-commit <sha>`, `--evidence-bead <id>`

Run `mulch status` to check domain health and entry counts.
Run `mulch --help` for full usage.
Mulch write commands use file locking and atomic writes — multiple agents can safely record to the same domain concurrently.

### Before You Finish

1. Discover what to record:
   ```bash
   mulch learn
   ```
2. Store insights from this work session:
   ```bash
   mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
   ```
3. Validate and commit:
   ```bash
   mulch sync
   ```
<!-- mulch:end -->

<!-- seeds:start -->
## Issue Tracking (Seeds)
<!-- seeds-onboard-v:1 -->

This project uses [Seeds](https://github.com/jayminwest/seeds) for git-native issue tracking.

**At the start of every session**, run:
```
sd prime
```

This injects session context: rules, command reference, and workflows.

**Quick reference:**
- `sd ready` — Find unblocked work
- `sd create --title "..." --type task --priority 2` — Create issue
- `sd update <id> --status in_progress` — Claim work
- `sd close <id>` — Complete work
- `sd sync` — Sync with git (run before pushing)

### Before You Finish
1. Close completed issues: `sd close <id>`
2. File issues for remaining work: `sd create --title "..."`
3. Sync and push: `sd sync && git push`
<!-- seeds:end -->

<!-- tane:start -->
## Prompt Management (Tane)
<!-- tane-onboard-v:1 -->

This project uses [Tane](https://github.com/jayminwest/canopy) for git-native prompt management.

**At the start of every session**, run:
```
ta prime
```

This injects prompt workflow context: commands, conventions, and common workflows.

**Quick reference:**
- `ta list` — List all prompts
- `ta render <name>` — View rendered prompt (resolves inheritance)
- `ta emit --all` — Render prompts to files
- `ta update <name>` — Update a prompt (creates new version)
- `ta sync` — Stage and commit .tane/ changes

**Do not manually edit emitted files.** Use `ta update` to modify prompts, then `ta emit` to regenerate.
<!-- tane:end -->
