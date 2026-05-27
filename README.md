# Tane

> 種 — seed. Git-native prompt management for AI coding agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Agents accumulate dozens of prompt files that share 60%+ identical content.
Tane fixes this: prompts are composed via sections and inheritance, versioned
automatically, validated against schemas, and emitted to plain `.md` for
downstream consumption. No duplication, no drift.

## Install

```bash
bun install -g @hana/tane-cli
```

### Development

```bash
git clone https://github.com/liker0704/tane
cd tane
bun install
bun link
bun test
```

## Quick start

```bash
ta init                                          # Create .tane/ in your project
ta create --name base-agent \
  --section role="You are a helpful assistant" \
  --section constraints="Follow all safety guidelines"
ta create --name reviewer --extends base-agent \
  --section role="You are a code reviewer"       # Inherits constraints from base
ta render reviewer                               # Resolve inheritance, output sections
ta emit --all                                    # Write all prompts to agents/*.md
```

## Commands

Every command supports `--json` for structured output. Global flags:
`-v`/`--version`, `-q`/`--quiet`, `--verbose`, `--timing`. ANSI colors respect
`NO_COLOR`.

### Prompts

| Command | Description |
|---------|-------------|
| `ta init` | Initialize `.tane/` in current directory |
| `ta create --name <text>` | Create a prompt (`--description`, `--extends`, `--mixin`, `--tag`, `--status`, `--emit-dir`, `--emit-as`, `--fm`, `--section name=body`) |
| `ta show <name>[@version]` | Show prompt record |
| `ta list` | List prompts (`--tag`, `--status`, `--extends`, `--mixin`) |
| `ta update <name>` | Update a prompt — creates new version |
| `ta archive <name>` | Soft-delete a prompt |
| `ta render <name>[@version]` | Resolve inheritance, output sections (`--format md\|json`) |
| `ta tree <name>` | Show inheritance tree |
| `ta history <name>` | Show version timeline (`--limit`) |
| `ta diff <name> <v1> <v2>` | Section-aware diff between two versions |
| `ta pin <name>@<version>` | Pin prompt to a specific version |
| `ta unpin <name>` | Remove version pin |

### Emit

| Command | Description |
|---------|-------------|
| `ta emit <name>` | Render and write prompt to file (`--out`, `--force`); emits `.ts` when `emitAs` ends in `.ts` |
| `ta emit --all` | Emit all active prompts (`--out-dir`, `--force`, `--dry-run`) |
| `ta emit --check` | Check if emitted files are up to date (CI use) |

### Schema & validation

| Command | Description |
|---------|-------------|
| `ta schema create --name <text>` | Create validation schema (`--required`, `--optional`) |
| `ta schema show <name>` | Show schema details |
| `ta schema list` | List schemas |
| `ta schema rule add <name>` | Add validation rule (`--section`, `--pattern`, `--message`) |
| `ta validate <name>` | Validate a prompt against its schema |
| `ta validate --all` | Validate all prompts with schemas |

### Agent integration

| Command | Description |
|---------|-------------|
| `ta prime` | Output workflow context for AI agents (`--compact`, `--export`) |
| `ta onboard` | Add tane section to CLAUDE.md (`--check`, `--stdout`) |

### Utility

| Command | Description |
|---------|-------------|
| `ta import <path>` | Import `.md` file as prompt (`--name`, `--no-split`, `--tag`) |
| `ta stats` | Show active/draft/archived counts |
| `ta sync` | Stage and commit `.tane/` changes (`--status`) |
| `ta doctor` | Check project health and data integrity (`--fix`, `--verbose`) |
| `ta upgrade` | Upgrade tane to the latest npm version (`--check`) |
| `ta completions <shell>` | Generate shell completions (bash, zsh, fish) |

## Architecture

Tane stores prompts as versioned JSONL records in `.tane/prompts.jsonl`, with
validation schemas in `schemas.jsonl` and project config in `config.yaml`.
Prompts are composed via single inheritance (`extends`) and multi-inheritance
(`mixins`) — a child inherits sections from its parent chain plus any mixin
prompts, and can override, append, or remove individual sections (up to 5
levels deep with circular reference detection). The `ta emit` pipeline renders
resolved prompts to plain `.md` files (or `.ts` modules when `emitAs` ends in
`.ts`) for downstream agent consumption.

See [CLAUDE.md](CLAUDE.md) for full technical details.

## How it works

```
1. ta init                → Creates .tane/ with JSONL files and config
2. ta create / ta update  → Prompts stored as versioned JSONL records
3. ta render              → Inheritance resolved, sections composed
4. ta emit                → Plain .md (or .ts) files written for agent consumption
5. git push               → Teammates get the same prompts, diffable in PRs
```

Prompts are **composed, not duplicated**. A child prompt inherits sections
from its parent (`extends`) and any mixin prompts (`mixins`), and can override,
append, or remove individual sections. Up to 5 levels deep with circular
reference detection.

## What's in `.tane/`

```
.tane/
├── config.yaml          # Project config (name, version, named emit targets)
├── prompts.jsonl        # All prompt records with full version history
├── schemas.jsonl        # Validation schema definitions
└── .gitignore           # Ignores *.lock files
```

Everything is git-tracked. JSONL is diffable, mergeable (`merge=union`
gitattribute), and append-friendly.

## Composition model

Single inheritance (`extends`) plus multi-inheritance (`mixins`) with
section-level control:

```
base-agent (sections: role, capabilities, workflow, constraints)
  └── reviewer (overrides: role, capabilities; inherits: workflow, constraints)
        └── senior-reviewer (overrides: role; inherits: everything else)

trait-caution (sections: caution)   ← mixin
trait-review (sections: review-style) ← mixin
  └── cautious-reviewer (extends: base-agent, mixins: [trait-review, trait-caution])
```

Resolution rules:

1. Resolve `extends` chain (parent first, recursive)
2. Apply `mixins` left-to-right — each mixin is fully resolved before merging
3. Apply focal prompt's own sections on top
4. Same-name section **overrides** earlier entry
5. New-name section **appends**
6. Empty body (`body: ""`) **removes** inherited section

## Concurrency & multi-agent safety

Tane uses advisory file locking and atomic writes — the same patterns used in
[Kura](https://github.com/liker0704/kura) and
[Suji](https://github.com/liker0704/suji).

- **Advisory locks**: `.jsonl.lock` files with `O_CREAT|O_EXCL`, 50ms polling,
  5s timeout, 30s stale cleanup
- **Atomic writes**: Write to temp file, rename over original (POSIX atomic)
- **Git merge**: `merge=union` in `.gitattributes` — parallel branches
  append-merge without conflicts
- **Dedup on read**: Highest version per ID wins, handles union merge duplicates

## Design principles

- **JSONL is the database** — No binary files, no export pipeline
- **Minimal dependencies** — chalk + commander only
- **Concurrent-safe** — Advisory locks + atomic writes
- **Git-native** — `merge=union` handles parallel merges, dedup on read
- **Prompts are composed** — Inheritance eliminates duplication
- **Emit to plain files** — Tane is source of truth, tools consume `.md` or `.ts`

## Part of Hana

Tane is part of the [Hana](https://github.com/liker0704/hana) ecosystem:

- [Haru](https://github.com/liker0704/haru) — orchestration
- [Kura](https://github.com/liker0704/kura) — structured expertise
- [Suji](https://github.com/liker0704/suji) — issue tracking
- [Tane](https://github.com/liker0704/tane) — prompt management

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

---

Maintained by [Kyryl Zmiienko](https://www.linkedin.com/in/kyryl-zmiienko/).

Part of a personal ecosystem alongside [Haru](https://github.com/liker0704/haru),
[Kura](https://github.com/liker0704/kura), and
[Suji](https://github.com/liker0704/suji). Diverged significantly from upstream.
