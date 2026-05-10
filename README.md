Forked from jayminwest/canopy under MIT License.

# Tane

Git-native prompt management for AI agent workflows.

[![npm](https://img.shields.io/npm/v/@hana/tane-cli)](https://www.npmjs.com/package/@hana/tane-cli)
[![CI](https://github.com/jayminwest/canopy/actions/workflows/ci.yml/badge.svg)](https://github.com/jayminwest/canopy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Agents accumulate dozens of prompt files that share 60%+ identical content. Tane fixes this: prompts are composed via sections and inheritance, versioned automatically, validated against schemas, and emitted to plain `.md` for downstream consumption. No duplication, no drift.

## Install

```bash
bun install -g @hana/tane-cli
```

Or try without installing:

```bash
npx @hana/tane-cli --help
```

### Development

```bash
git clone https://github.com/jayminwest/canopy.git
cd tane
bun install
bun link              # Makes 'ta' available globally

bun test              # Run all tests
bun run lint          # Biome check
bun run typecheck     # tsc --noEmit
```

## Quick Start

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

Every command supports `--json` for structured output. Global flags: `-v`/`--version`, `-q`/`--quiet`, `--verbose`, `--timing`. ANSI colors respect `NO_COLOR`.

### Prompt Commands

| Command | Description |
|---------|-------------|
| `ta init` | Initialize `.tane/` in current directory |
| `ta create --name <text>` | Create a new prompt (`--description`, `--extends`, `--mixin`, `--tag`, `--status`, `--emit-dir`, `--emit-as`, `--fm`, `--section name=body`) |
| `ta show <name>[@version]` | Show prompt record |
| `ta list` | List prompts (`--tag`, `--status`, `--extends`, `--mixin` filters) |
| `ta update <name>` | Update a prompt — creates new version (`--section`, `--add-section`, `--remove-section`, `--tag`, `--untag`, `--description`, `--schema`, `--extends`, `--mixin`, `--remove-mixin`, `--emit-dir`, `--emit-as`, `--fm`, `--remove-fm`, `--status`, `--name`) |
| `ta archive <name>` | Soft-delete a prompt |
| `ta render <name>[@version]` | Resolve inheritance, output sections (`--format md\|json`) |
| `ta tree <name>` | Show inheritance tree |
| `ta history <name>` | Show version timeline (`--limit`) |
| `ta diff <name> <v1> <v2>` | Section-aware diff between two versions |
| `ta pin <name>@<version>` | Pin prompt to a specific version |
| `ta unpin <name>` | Remove version pin |

### Emit Commands

| Command | Description |
|---------|-------------|
| `ta emit <name>` | Render and write prompt to file (`--out`, `--force`); emits `.ts` when `emitAs` ends in `.ts` |
| `ta emit --all` | Emit all active prompts (`--out-dir`, `--force`, `--dry-run`) |
| `ta emit --check` | Check if emitted files are up to date (CI use) |

### Schema & Validation

| Command | Description |
|---------|-------------|
| `ta schema create --name <text>` | Create validation schema (`--required`, `--optional` sections) |
| `ta schema show <name>` | Show schema details |
| `ta schema list` | List all schemas |
| `ta schema rule add <name>` | Add validation rule (`--section`, `--pattern`, `--message`) |
| `ta validate <name>` | Validate a prompt against its schema |
| `ta validate --all` | Validate all prompts with schemas |

### Agent Integration

| Command | Description |
|---------|-------------|
| `ta prime` | Output workflow context for AI agents (`--compact`, `--export`) |
| `ta onboard` | Add tane section to CLAUDE.md (`--check`, `--stdout`) |

### Utility

| Command | Description |
|---------|-------------|
| `ta import <path>` | Import `.md` file as prompt (`--name`, `--no-split`, `--tag`); splits on `##` by default, extracts YAML frontmatter |
| `ta stats` | Show active/draft/archived counts |
| `ta sync` | Stage and commit `.tane/` changes (`--status`) |
| `ta doctor` | Check project health and data integrity (`--fix`, `--verbose`) |
| `ta upgrade` | Upgrade tane to the latest npm version (`--check`) |
| `ta completions <shell>` | Generate shell completions (bash, zsh, fish) |

## Architecture

Tane stores prompts as versioned JSONL records in `.tane/prompts.jsonl`, with validation schemas in `schemas.jsonl` and project config in `config.yaml`. Prompts are composed via single inheritance (`extends`) and multi-inheritance (`mixins`) — a child inherits sections from its parent chain plus any mixin prompts, and can override, append, or remove individual sections (up to 5 levels deep with circular reference detection). The `ta emit` pipeline renders resolved prompts to plain `.md` files (or `.ts` modules when `emitAs` ends in `.ts`) for downstream agent consumption. Advisory file locks and atomic writes ensure concurrent-safe access. See [CLAUDE.md](CLAUDE.md) for full technical details.

## How It Works

```
1. ta init                → Creates .tane/ with JSONL files and config
2. ta create / ta update  → Prompts stored as versioned JSONL records
3. ta render              → Inheritance resolved, sections composed
4. ta emit                → Plain .md (or .ts) files written for agent consumption
5. git push               → Teammates get the same prompts, diffable in PRs
```

Prompts are **composed, not duplicated**. A child prompt inherits sections from its parent (`extends`) and any mixin prompts (`mixins`), and can override, append, or remove individual sections. Up to 5 levels deep with circular reference detection.

## What's in `.tane/`

```
.tane/
├── config.yaml          # Project config (project name, version, named emit targets)
├── prompts.jsonl        # All prompt records with full version history
├── schemas.jsonl        # Validation schema definitions
└── .gitignore           # Ignores *.lock files
```

Everything is git-tracked. JSONL is diffable, mergeable (`merge=union` gitattribute), and append-friendly.

## Composition Model

Single inheritance (`extends`) plus multi-inheritance (`mixins`) with section-level control:

```
base-agent (sections: role, capabilities, workflow, constraints)
  └── reviewer (overrides: role, capabilities; inherits: workflow, constraints)
        └── senior-reviewer (overrides: role; inherits: everything else)

trait-caution (sections: caution)   ← mixin
trait-review (sections: review-style) ← mixin
  └── cautious-reviewer (extends: base-agent, mixins: [trait-review, trait-caution])
```

**Resolution rules:**
1. Resolve `extends` chain (parent first, recursive)
2. Apply `mixins` left-to-right — each mixin is fully resolved before merging
3. Apply focal prompt's own sections on top
4. Same-name section **overrides** earlier entry
5. New-name section **appends**
6. Empty body (`body: ""`) **removes** inherited section

## Concurrency & Multi-Agent Safety

Tane uses advisory file locking and atomic writes — the same patterns proven in [mulch](https://github.com/jayminwest/mulch) and [seeds](https://github.com/jayminwest/seeds).

- **Advisory locks**: `.jsonl.lock` files with `O_CREAT|O_EXCL`, 50ms polling, 5s timeout, 30s stale cleanup
- **Atomic writes**: Write to temp file, rename over original (POSIX atomic)
- **Git merge**: `merge=union` in `.gitattributes` — parallel branches append-merge without conflicts
- **Dedup on read**: Highest version per ID wins, handles union merge duplicates

## Design Principles

- **JSONL is the database** — No binary files, no export pipeline
- **Minimal dependencies** — chalk + commander only
- **Concurrent-safe** — Advisory locks + atomic writes
- **Git-native** — `merge=union` handles parallel merges, dedup on read
- **Prompts are composed** — Inheritance eliminates duplication
- **Emit to plain files** — Tane is source of truth, tools consume `.md` or `.ts`

## Project Structure

```
tane/
  src/
    index.ts               CLI entry point (command router)
    types.ts               Data models
    store.ts               JSONL I/O, locking, atomic writes
    render.ts              Inheritance resolution engine
    validate.ts            Schema validation
    config.ts              YAML config loading
    output.ts              JSON/human output formatting
    yaml.ts                Minimal YAML parser
    frontmatter.ts         YAML frontmatter extraction and rendering
    id.ts                  ID generation
    markers.ts             Marker-based section management for CLAUDE.md
    commands/              One file per CLI subcommand (23 commands)
  scripts/
    version-bump.ts        Atomic version management
  .tane/                 On-disk data store
  .github/workflows/       CI + npm publish
```

## Part of os-eco

Tane is part of the [os-eco](https://github.com/jayminwest/os-eco) AI agent tooling ecosystem.

<p align="center">
  <img src="https://raw.githubusercontent.com/jayminwest/os-eco/main/branding/logo.png" alt="os-eco" width="444" />
</p>

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on setting up a development environment, coding conventions, and submitting pull requests.

For security issues, see [SECURITY.md](SECURITY.md).

## License

MIT
