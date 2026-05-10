# Tane

Git-native prompt management for AI agent workflows. Zero dependencies, JSONL storage, Bun runtime.

Prompts are structured records with composable sections, inheritance, versioning, and schema validation. The JSONL file IS the database. `ta emit` renders prompts to plain `.md` files for consumption by any tool.

## Why

Prompt engineering today is unmanaged text files:

- **Monolithic `.md` files** with no internal structure — one bad edit breaks the whole prompt
- **Copy-paste duplication** across agent definitions (overstory's 7 agent `.md` files share ~60% identical content)
- **No versioning beyond git** — git diffs treat prompts as opaque text, can't answer "what changed in the constraints section between Tuesday and today?"
- **No validation** — nothing stops you from accidentally deleting a required section
- **No composition** — changing a shared convention means editing every file that contains it
- **No audit trail for agent runs** — when agent behavior changes, you can't correlate it to a specific prompt version

Overstory manages 7 agent definitions, 2 templates, and generates per-task overlays. Mulch manages structured expertise. Seeds manages issues. But the prompts themselves — the most important input to every agent — are loose files with no tooling.

## Design Principles

1. **JSONL is the database.** No binary files, no export pipeline, no sync step. One file per record type, diffable, mergeable.
2. **Zero runtime dependencies.** Bun built-ins only (`Bun.file`, `Bun.write`, `node:fs`, `node:crypto`).
3. **Concurrent-safe by default.** Advisory file locks + atomic writes. Multiple agents in worktrees can read/write safely.
4. **Git-native.** `merge=union` gitattribute handles parallel branch merges. No custom merge driver needed.
5. **Prompts are composed, not duplicated.** Sections are the unit of reuse. Inheritance eliminates copy-paste. Change once, propagate everywhere.
6. **Emit to plain files.** Tane is the source of truth; downstream tools consume rendered `.md` files via `ta emit`. Adoption is incremental — no tool needs to understand tane natively.
7. **Ecosystem fit.** Same stack as overstory (Bun/TS), same patterns as mulch/seeds (JSONL + locks), same CLI conventions (`--json` flag on everything).

## On-Disk Format

```
.tane/
  config.yaml          # Project config (YAML, matches overstory/mulch/seeds convention)
  prompts.jsonl        # All prompt records with version history
  schemas.jsonl        # Validation schema definitions
  .gitignore           # Ignores lock files
```

### config.yaml

```yaml
project: overstory
version: "1"
targets:
  agents:
    dir: agents
    default: true
  commands:
    dir: .claude/commands
    tags:
      - slash-command
```

The `project` field is used as the ID prefix (e.g., `overstory-a1b2`). The `targets` section defines named emit targets — each with a directory, an optional `default: true` marker, and optional tags for routing prompts by tag.

When `ta emit` resolves the output directory for a prompt:
1. Per-prompt `emitDir` override (if set on the prompt)
2. First target whose `tags` match one of the prompt's tags
3. Target marked `default: true`
4. Fallback to `"agents"`

Legacy configs using `emitDir`/`emitDirByTag` are transparently converted to named targets on load.

YAML parsed by a minimal built-in parser that handles nested maps, arrays, and flat key-value pairs. No external dependency.

### prompts.jsonl

One prompt record per line, append-only for version history. The current state of a prompt is the last line with that ID (dedup-on-read, same as seeds). Mutations append a new version rather than overwriting.

```jsonl
{"id":"overstory-a1b2","name":"base-agent","version":1,"sections":[{"name":"role","body":"You are an agent in the overstory swarm system.","required":true},{"name":"constraints","body":"- Never push to canonical branch\n- Never spawn sub-workers","required":true}],"tags":["agent","base"],"status":"active","createdAt":"2026-02-22T10:00:00Z","updatedAt":"2026-02-22T10:00:00Z"}
{"id":"overstory-c3d4","name":"builder","version":1,"sections":[{"name":"role","body":"You are a builder agent. You write code, run tests, and deliver working software."},{"name":"quality-gates","body":"Run bun test, bun run lint, bun run typecheck before closing."}],"extends":"base-agent","tags":["agent","leaf"],"schema":"agent-definition","status":"active","createdAt":"2026-02-22T10:05:00Z","updatedAt":"2026-02-22T10:05:00Z"}
```

### schemas.jsonl

Validation schema definitions, one per line:

```jsonl
{"id":"schema-a1b2","name":"agent-definition","requiredSections":["role","constraints","workflow"],"optionalSections":["capabilities","communication","quality-gates","failure-modes"],"rules":[{"section":"constraints","pattern":"Never push","message":"Agent constraints must include push restriction"}],"createdAt":"2026-02-22T10:00:00Z","updatedAt":"2026-02-22T10:00:00Z"}
```

### .gitignore

```
*.lock
```

### .gitattributes (appended to project root)

```
.tane/prompts.jsonl merge=union
.tane/schemas.jsonl merge=union
```

Union merge strategy: on branch merge, git takes lines from both sides. Since each record is one line with a unique ID, this produces correct results for parallel work. Duplicate lines (same prompt modified on both branches) are handled by tane's dedup-on-read — last occurrence wins (highest version number for same ID).

## Data Model

### Section

The atomic unit of prompt content. Sections are the building blocks that enable composition and targeted validation.

```typescript
interface Section {
  name: string;              // "role", "constraints", "workflow", etc.
  body: string;              // Markdown content (newlines escaped in JSONL)
  required?: boolean;        // If true, cannot be removed by child prompts
}
```

Section names are freeform strings. Common conventions:
- `role` — what the agent is and does
- `capabilities` — tools and permissions available
- `workflow` — step-by-step process
- `constraints` — hard rules and boundaries
- `communication` — messaging protocol
- `quality-gates` — checks before completion
- `failure-modes` — named anti-patterns to avoid

### Prompt

```typescript
interface Prompt {
  // Identity
  id: string;                // "{project}-{4hex}", e.g. "overstory-a1b2"
  name: string;              // Human-readable, unique across active prompts

  // Versioning
  version: number;           // Auto-incremented on update, starts at 1

  // Content
  sections: Section[];       // Ordered list of sections

  // Composition
  extends?: string;          // Parent prompt name (single inheritance)

  // Metadata
  tags?: string[];           // Freeform tags for filtering
  schema?: string;           // Schema name for validation
  emitAs?: string;           // Override filename for ta emit (default: {name}.md)
  status: "draft" | "active" | "archived";

  // Timestamps
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
}
```

### Schema

```typescript
interface ValidationRule {
  section: string;           // Section name to validate
  pattern: string;           // Regex that must match in the section body
  message: string;           // Error message if validation fails
}

interface Schema {
  id: string;                // "schema-{4hex}"
  name: string;              // Human-readable, unique

  // Section requirements
  requiredSections: string[];    // Must be present (directly or inherited)
  optionalSections?: string[];   // Documented but not enforced

  // Content rules
  rules?: ValidationRule[];      // Regex checks on section content

  // Timestamps
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
}
```

### ID Generation

- Prompts: `{project}-{4 random hex chars}` (e.g., `overstory-e7f3`)
- Schemas: `schema-{4 random hex chars}` (e.g., `schema-b2c9`)
- Collision-checked against existing entries on create
- Falls back to 8 hex chars after 100 collisions (won't happen in practice)
- Matches seeds/mulch format for ecosystem consistency

### Status Lifecycle

```
draft ──> active ──> archived
  ^          │
  └──────────┘  (reactivate via update --status=active)
```

- `draft` — work in progress, excluded from `ta emit --all`
- `active` — current, included in emit and validation
- `archived` — soft-deleted, excluded from listings (still queryable with `--status archived`)

## Composition Model

### Inheritance

A prompt can extend one parent via the `extends` field. The parent is referenced by name (not ID), so renaming breaks the chain intentionally (forces explicit update).

Resolution order for `ta render`:
1. Start with the parent's rendered sections (recursively resolved if parent also extends)
2. For each section in the child:
   - If a section with the same name exists in the parent: **override** (child's body replaces parent's)
   - If no matching section exists: **append** (added after parent's sections)
3. Parent sections not overridden by the child are **inherited** as-is
4. Section ordering: parent sections first (in parent's order), then child-only sections (in child's order)

```
base-agent (sections: role, capabilities, workflow, constraints, communication)
  ├── builder (overrides: role, capabilities; adds: quality-gates, failure-modes)
  ├── scout (overrides: role, capabilities; removes: none)
  └── reviewer (overrides: role, capabilities; adds: verdict-format)
```

Rendered `builder` output contains: role (builder's), capabilities (builder's), workflow (base's), constraints (base's), communication (base's), quality-gates (builder's), failure-modes (builder's).

### Section Removal

A child prompt can explicitly remove an inherited section by including it with an empty body:

```bash
ta update builder --section quality-gates --body ""
```

This is recorded as a section with `body: ""`, which the renderer interprets as "do not include this section in output." Useful when a child legitimately doesn't need a parent section.

### Depth Limit

Inheritance depth is capped at 5 levels. This is enforced at render time — if resolution exceeds 5 levels, `ta render` errors with a clear message. In practice, 2-3 levels covers all real use cases (base → capability → specialization).

### Circular Reference Detection

`ta render` tracks visited prompt names during resolution. If a cycle is detected, it errors immediately with the chain (e.g., "Circular inheritance: builder → base-agent → builder").

## Versioning Model

Every `ta update` appends a new JSONL line with an incremented version number. The prompts.jsonl file contains the full version history.

```jsonl
{"id":"overstory-a1b2","name":"builder","version":1,"sections":[...],...}
{"id":"overstory-a1b2","name":"builder","version":2,"sections":[...],...}
{"id":"overstory-a1b2","name":"builder","version":3,"sections":[...],...}
```

Current state: last line for each ID (highest version). This is the same dedup-on-read pattern as seeds.

### Version Pinning

A prompt can be pinned to a specific version:

```bash
ta pin builder@2
```

When pinned, `ta render builder` and `ta emit builder` use version 2 instead of the latest. The pin is stored as metadata on the prompt record (a new line appended with `pinned: 2`). `ta unpin builder` removes the pin.

Pinning is useful when a child prompt depends on a stable parent — pin the parent to avoid unexpected inheritance changes.

### History and Diffing

Version history enables structured diffing:

```bash
ta history builder           # Show all versions with timestamps
ta diff builder 1 3          # Show what changed between v1 and v3
```

The diff output is section-aware: it shows which sections were added, removed, or modified — not just a line-by-line text diff. This is the key advantage over `git diff` on a raw `.md` file.

## CLI

Binary name: `ta` (tane).

Every command supports `--json` for structured output. Non-JSON output is human-readable with ANSI colors (respects `NO_COLOR`).

### Prompt Commands

```
ta init                                Initialize .tane/ in current directory

ta create                              Create a new prompt
  --name <text>        (required)      Unique prompt name
  --extends <name>                     Parent prompt to inherit from
  --tag <tag>                          Add tag (repeatable)
  --schema <name>                      Apply validation schema
  --emit-as <filename>                 Override emit filename (default: {name}.md)
  --status <status>    draft|active (default: active)

ta show <name>                         Show prompt record (raw sections)
ta show <name>@<version>               Show specific version

ta list                                List prompts
  --tag <tag>                          Filter by tag
  --status <status>    draft|active|archived
  --extends <name>                     Show children of a parent

ta update <name>                       Update a prompt (creates new version)
  --section <name> --body <content>    Update a section's body
  --add-section <name> --body <content> Add a new section
  --remove-section <name>              Remove a section (empty body override)
  --tag <tag>                          Add tag
  --untag <tag>                        Remove tag
  --schema <name>                      Change schema
  --extends <name>                     Change parent
  --emit-as <filename>                 Change emit filename
  --status <status>                    Change status
  --name <new-name>                    Rename prompt

ta archive <name>                      Archive a prompt (soft delete)

ta render <name>                       Render full prompt (resolve inheritance)
  --format md                          Output as markdown (default)
  --format json                        Output as structured JSON
ta render <name>@<version>             Render specific version

ta tree <name>                         Show inheritance tree (parent and children)

ta history <name>                      Show version timeline
  --limit <n>                          Max versions to show (default: 20)

ta diff <name> <v1> <v2>              Section-aware diff between two versions

ta pin <name>@<version>                Pin prompt to a specific version
ta unpin <name>                        Remove version pin
```

### Emit Commands

```
ta emit <name>                         Render and write prompt to a file
  --out <path>                         Output path (default: {emitDir}/{emitAs or name}.md)
  --force                              Overwrite without confirmation

ta emit --all                          Emit all active prompts
  --out-dir <dir>                      Output directory (default: config.emitDir)
  --force                              Overwrite without confirmation
  --dry-run                            Show what would be emitted without writing

ta emit --check                        Check if emitted files are up to date
                                       Exit code 1 if stale (useful in CI)
```

### Schema Commands

```
ta schema create                       Create a validation schema
  --name <text>        (required)
  --required <sections>                Comma-separated required section names
  --optional <sections>                Comma-separated optional section names

ta schema show <name>                  Show schema details

ta schema list                         List all schemas

ta schema rule add <schema-name>       Add a validation rule
  --section <name>     (required)      Section to validate
  --pattern <regex>    (required)      Regex that must match
  --message <text>     (required)      Error message on failure

ta validate <name>                     Validate a prompt against its schema
ta validate --all                      Validate all prompts with schemas
```

### Utility Commands

```
ta stats                               Prompt statistics (active/draft/archived counts)

ta sync                                Stage and commit .tane/ changes
  --status                             Check for uncommitted changes without committing

ta import <path>                       Import an existing .md file as a prompt
  --name <text>        (required)      Prompt name
  --split                              Auto-split into sections by ## headers
  --tag <tag>                          Add tag (repeatable)
```

### JSON Output Format

Success:
```json
{ "success": true, "command": "create", "id": "overstory-a1b2", "name": "builder" }
```

Error:
```json
{ "success": false, "command": "create", "error": "Prompt name 'builder' already exists" }
```

List results:
```json
{ "success": true, "command": "list", "prompts": [...], "count": 7 }
```

Render:
```json
{ "success": true, "command": "render", "name": "builder", "version": 3, "sections": [...], "resolvedFrom": ["base-agent", "builder"] }
```

Emit:
```json
{ "success": true, "command": "emit", "files": [{"name": "builder", "path": "agents/builder.md", "version": 3}] }
```

Validate:
```json
{ "success": true, "command": "validate", "name": "builder", "valid": true, "warnings": [] }
{ "success": false, "command": "validate", "name": "builder", "valid": false, "errors": [{"section": "constraints", "rule": "Never push", "message": "Agent constraints must include push restriction"}] }
```

Diff:
```json
{ "success": true, "command": "diff", "name": "builder", "from": 1, "to": 3, "changes": [{"section": "role", "type": "modified"}, {"section": "quality-gates", "type": "added"}] }
```

## Concurrency Model

Identical to seeds/mulch — proven in production with multi-agent concurrent access.

### Advisory File Locking

```
Lock file:    .tane/prompts.jsonl.lock
Stale after:  30 seconds
Retry:        50ms polling
Timeout:      5 seconds
```

Implementation:
1. Create lock file with `O_CREAT | O_EXCL` (atomic, fails if exists)
2. If `EEXIST`: check mtime, delete if stale (>30s), retry
3. Timeout after 5s with error
4. Execute operation under lock
5. Remove lock file in `finally` block (best-effort)

### Atomic Writes

All mutations follow this pattern:
1. Acquire lock
2. Read JSONL into memory
3. Apply mutation (append new version line)
4. Write to `.jsonl.tmp.{random}`
5. Rename temp file over original (atomic on POSIX)
6. Release lock

Version-only appends (updates) never delete old lines — they append a new line with an incremented version. This means the file grows with history, which is the desired behavior (version history IS the append log).

### Dedup on Read

After a `merge=union` git merge, `prompts.jsonl` may contain duplicate lines for the same prompt version. On read, tane deduplicates by ID + version — if two lines have the same ID and version, last occurrence wins.

For current state queries (show, list, render), only the highest version per ID is used.

## The Import Command

Bridging existing `.md` files into tane:

```bash
ta import agents/builder.md --name builder --split --tag agent
```

With `--split`, the importer parses markdown `## Heading` boundaries and creates one section per heading:

```markdown
## Role

You are a builder agent...

## Constraints

- Never push to canonical branch...
```

Becomes:
```json
{
  "sections": [
    {"name": "role", "body": "You are a builder agent..."},
    {"name": "constraints", "body": "- Never push to canonical branch..."}
  ]
}
```

Content before the first `##` heading becomes a section named `intro`. Headings are lowercased and spaces replaced with hyphens (`## Quality Gates` becomes `quality-gates`).

Without `--split`, the entire file becomes a single section named `body`.

## Integration with Overstory

### Prompt Source

Overstory's overlay generator (`src/agents/overlay.ts`) currently reads raw `.md` files from the `agents/` directory. With tane, two integration paths:

**Path 1 (zero coupling):** Use `ta emit --all --out-dir agents/` as a build step. Overstory reads `.md` files as before. Tane is invisible to overstory.

**Path 2 (native integration):** Overstory wraps tane via `Bun.spawn(["ta", ...])` with `--json` parsing, same as seeds/mulch:

| Overstory operation | ta command |
|--------------------|------------|
| Load agent definition | `ta render <name> --format md` |
| Check prompt version | `ta show <name> --json` |
| Validate before sling | `ta validate <name> --json` |
| Record prompt version in session | read `version` from `ta show` output |

Path 1 is recommended for initial adoption. Path 2 adds value when you want session-level prompt version tracking.

### Agent-Facing Commands

Agents don't interact with tane directly. They receive rendered prompts via their CLAUDE.md overlay and agent definition `.md` files. Tane is an authoring tool, not a runtime dependency.

### Mulch Integration

Mulch expertise records often describe prompt conventions ("agent definitions should include four behavioral sections"). Tane schemas can codify these conventions as enforceable rules rather than prose.

## Standalone Value (Outside Overstory)

Tane is useful for anyone managing prompts:

- **Chatbot developers** — version personas, validate required safety sections, compose base personality + domain specialization
- **RAG pipeline builders** — manage system prompts across retrieval, synthesis, and formatting stages with shared constraints
- **Content teams** — enforce brand voice sections across multiple prompt templates
- **AI agent frameworks** — any multi-agent system with duplicated prompt content benefits from composition
- **Solo developers** — version and diff prompt iterations, import existing `.md` files incrementally

The `ta import --split` and `ta emit` commands make adoption zero-friction: import what you have, manage it in tane, emit to whatever format your tools expect.

## What Tane Does NOT Do

Explicitly out of scope (keep it minimal):

- **No prompt execution.** Tane manages prompts, it doesn't run them against an LLM. That's the consumer's job.
- **No variable interpolation.** Sections are static markdown. Runtime templating (`{task_id}`, `{file_scope}`) is the consumer's responsibility.
- **No A/B testing.** Tane versions and diffs, but doesn't track which version "performed better." That needs execution data tane doesn't have.
- **No daemon.** No background process, no socket, no PID files.
- **No binary database.** JSONL only. No SQLite, no Dolt.
- **No remote sync.** `ta sync` commits locally. `git push` handles the rest.
- **No custom merge driver.** `merge=union` handles everything. Dedup on read handles edge cases.
- **No compact command (yet).** Version history grows the JSONL file. Ship `ta compact` when file bloat becomes a real problem (keeps only latest N versions per prompt).

## Tech Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Bun | Matches overstory/seeds/mulch, runs TS directly |
| Language | TypeScript (strict) | Matches ecosystem |
| Dependencies | Zero runtime | Matches overstory's hard rule |
| Config | YAML (minimal built-in parser) | Matches ecosystem convention |
| Storage | JSONL | Git-native, diffable, mergeable |
| Locking | Advisory file locks | Proven in mulch/seeds for multi-agent |
| Formatting | Biome (tabs, 100 char width) | Matches ecosystem |
| Testing | `bun test` (colocated) | Real I/O, no mocks |
| Distribution | `bun link` locally | No npm publish for now |

## Project Infrastructure

### Directory Structure

```
tane/
  package.json
  tsconfig.json
  biome.json
  .gitignore
  CHANGELOG.md
  README.md
  CLAUDE.md
  scripts/
    version-bump.ts           # Bump version in package.json + src/index.ts
  .claude/
    commands/
      release.md              # /release slash command
  .github/
    workflows/
      ci.yml                  # lint + typecheck + test on push/PR
      auto-tag.yml            # Auto-tag + GitHub release on version bump
  src/
    index.ts                  # CLI entry + command router + VERSION constant
    types.ts                  # Prompt, Section, Schema, Config, constants
    store.ts                  # JSONL read/write/lock/atomic
    id.ts                     # ID generation
    config.ts                 # YAML config load/save
    output.ts                 # JSON + human output helpers
    yaml.ts                   # Minimal YAML parser (flat key-value only)
    render.ts                 # Inheritance resolution + section composition
    validate.ts               # Schema validation engine
    commands/
      init.ts                 # ta init
      create.ts               # ta create
      show.ts                 # ta show
      list.ts                 # ta list
      update.ts               # ta update
      archive.ts              # ta archive
      render.ts               # ta render
      tree.ts                 # ta tree
      history.ts              # ta history
      diff.ts                 # ta diff
      pin.ts                  # ta pin / ta unpin
      emit.ts                 # ta emit
      schema.ts               # ta schema create/show/list/rule
      validate.ts             # ta validate
      import.ts               # ta import
      sync.ts                 # ta sync
      stats.ts                # ta stats
    render.test.ts            # Inheritance resolution tests
    validate.test.ts          # Schema validation tests
    store.test.ts             # Core data layer tests
    id.test.ts                # ID generation tests
    yaml.test.ts              # YAML parser tests
    commands/
      init.test.ts            # Init integration tests
      create.test.ts          # Create + show + render tests
      emit.test.ts            # Emit + import round-trip tests
      diff.test.ts            # Version diffing tests
      schema.test.ts          # Schema validation integration tests
```

### Version Management

Version lives in two locations (verified in sync by CI):
- `package.json` -- `"version"` field
- `src/index.ts` -- `const VERSION = "X.Y.Z"`

Bump via: `bun run version:bump <major|minor|patch>`

Script updates both files atomically and prints next steps.

### CHANGELOG.md

[Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

## [Unreleased]

## [0.1.0] - YYYY-MM-DD

### Added
- Initial release
- Prompt CRUD (create, show, list, update, archive)
- Section-based composition with single inheritance
- Version history with structured diffing
- Version pinning
- Schema validation (required sections, regex rules)
- Emit to plain .md files (single + batch)
- Import from existing .md files with auto-split
- Inheritance tree visualization
- Advisory file locking for concurrent access
- Atomic writes with dedup-on-read
- YAML config, JSONL storage
- --json flag on all commands
```

### /release Slash Command

`.claude/commands/release.md` -- identical workflow to overstory/seeds:

1. Analyze changes since last release (`git log`, `git diff`)
2. Determine version bump (major/minor/patch, default: patch)
3. Bump version in `package.json` and `src/index.ts`
4. Update `CHANGELOG.md` with categorized changes
5. Update `CLAUDE.md` if command counts or structure changed
6. Update `README.md` if CLI reference or stats changed
7. Present summary -- do NOT commit or push

### CI Workflow (`.github/workflows/ci.yml`)

Runs on push to main and PRs:

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bun run lint
      - run: bun run typecheck
      - run: bun test
```

### Auto-Tag Workflow (`.github/workflows/auto-tag.yml`)

Runs on push to main. After CI passes:

1. Read version from `package.json`
2. Verify `package.json` and `src/index.ts` versions match
3. Check if git tag `vX.Y.Z` already exists (idempotent)
4. If new version: create tag, push tag, create GitHub release with auto-generated notes

### CLAUDE.md

Project instructions for Claude Code sessions. Covers:

- Tech stack and conventions (Bun, zero deps, Biome, strict TS)
- Directory structure
- CLI command reference
- Composition model (inheritance, sections, rendering)
- Testing philosophy (real I/O, no mocks, temp dirs)
- Quality gates (`bun test && bun run lint && bun run typecheck`)
- Coding conventions (tabs, 100 char width, `noUncheckedIndexedAccess`, no `any`)

### package.json Scripts

```json
{
  "scripts": {
    "test": "bun test",
    "lint": "bunx biome check .",
    "typecheck": "tsc --noEmit",
    "version:bump": "bun run scripts/version-bump.ts"
  }
}
```

## Estimated Size

| Area | Files | LOC |
|------|-------|-----|
| Core (types, store, id, config, yaml, output) | 6 | ~400 |
| Composition engine (render, validate) | 2 | ~300 |
| Commands (17 command files) | 17 | ~1,000 |
| CLI entry point | 1 | ~90 |
| Tests | 10 | ~700 |
| Scripts | 1 | ~75 |
| Infrastructure (CLAUDE.md, release.md, workflows) | 5 | ~300 |
| **Total** | **42** | **~2,865** |
