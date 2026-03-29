# pi-inline-format

This repo is a strict Pi extension package scaffold with a TypeScript Pi wrapper in `extensions/` and a Rust core crate in `rust/`.

The repository-root `/home/choza/projects/AGENTS.md` remains binding. This file adds project-local guidance for `pi-inline-format`.

## Commands

After code changes, run:

```bash
npm run check
```

Individual commands:

- `npm run lint` — Strict TypeScript ESLint checks
- `npm run format` — Prettier check
- `npm run typecheck` — TypeScript typecheck
- `npm run rust:fmt` — rustfmt check
- `npm run rust:check` — Rust compile checks
- `npm run rust:lint` — strict clippy checks
- `npm run rust:test` — Rust tests

## Conventions

- Read existing files and gather evidence before editing.
- Keep the TypeScript layer as a thin Pi-facing wrapper.
- Put parsing, detection, and performance-sensitive logic in the Rust core crate.
- Keep lint policy centralized in `tsconfig.json`, `eslint.config.mjs`, and `rust/Cargo.toml` instead of scattering file-level overrides.
- Treat unused code as an error in both TypeScript and Rust.
- Keep the Rust transcript contract generic: use regions, roles, and languages instead of Python-only result names.
- Prefer project-local extension/package changes over broad Pi core rewrites unless evidence shows core changes are required.
- Keep Rust CLI spawning, fallback resolution, and JSON shape validation in a dedicated helper so `extensions/index.ts` stays focused on Pi commands/tools.
- For normal Pi user-flow rendering, prefer overriding the built-in `bash` tool with Rust-derived render metadata instead of relying on helper-only commands.
- When extending nested-language detection, add or adjust Rust pattern descriptors (for example `NESTED_REGION_PATTERNS`) instead of changing the stable JSON contract or moving parsing into TypeScript.
- When Pi-facing rendering needs readable output, derive markdown/code-fence formatting from Rust `render_blocks` rather than rebuilding transcript splitting logic in TypeScript.

## Ralph / tmux interaction rule

- When guiding a live Pi slash-command workflow in tmux for this repo, if the agent has explicitly proposed the next slash command(s) and the user replies with a short approval such as `go ahead`, treat that as permission to send the corresponding tmux keys into the active Pi pane instead of merely reprinting the command for the user.
- In that mode, operate step-by-step:
  1. send one slash command,
  2. read/capture the pane output,
  3. verify the state matches expectations,
  4. only then send the next slash command.
- Prefer cheap/read-only slash commands first when checking readiness or state, such as `/ralphi-loop-status` or `/ralphi-loop-guidance-show`.
- If Pi reports that the agent is busy, the pane is still working, or state is ambiguous, stop before sending the next slash command and report the blocker.
- Do not blindly blast multiple slash commands into the pane at once unless the user explicitly asks for that behavior.

## Smoke test / branch hygiene

- Before picking up the next task in this repo, run `/home/choza/projects/scripts/tmux-agent-registry.sh preflight-smoke` and tear down stale repo-owned smoke sessions (for example `pi-inline-smoke-*`) instead of letting them accumulate.
- Smoke runs for this repo must live in their own dedicated tmux window/session (for example a transient `pi-inline-smoke-*` window created only for that smoke) so cleanup is one obvious kill operation instead of mixed-pane cleanup in a shared workspace window.
- After every repo-owned tmux smoke test, capture the needed evidence, kill the transient smoke window/session itself, and run `/home/choza/projects/scripts/tmux-agent-registry.sh prune` before moving on.
- Treat smoke sessions for this repo as disposable by default; do not leave old `pi-inline-smoke-*` sessions around between tasks unless the user explicitly asks for a live handoff.
- Branch discipline: prefer `main` as the default branch for the next unrelated task. If work must continue on a feature branch, say so explicitly, keep the branch focused, and switch back to `main` before starting unrelated work so the merge direction stays clear.

## Directory Structure

```text
pi-inline-format/
├── extensions/       # Pi extension entrypoint(s)
├── rust/             # Rust core crate
├── .pi/              # Pi-local state/config artifacts
├── .ralphi/          # Ralph loop config/runtime files
└── package.json
```

## Testing Patterns

- Rust tests live alongside Rust code in `rust/src/`.
- Add TypeScript tests only when the wrapper contains real logic worth testing.
- Keep wrapper logic minimal and push real behavior into Rust when possible.

<!-- BEGIN BEADS INTEGRATION -->

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs via Dolt:

- Each write auto-commits to Dolt history
- Use `bd dolt push`/`bd dolt pull` for remote sync
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Landing the Plane (Session Completion)

**When ending a work session**, complete the steps below. The repository-root `/home/choza/projects/AGENTS.md` remains binding, including the workspace rule that `git push` is forbidden unless the user explicitly overrides it.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Sync Beads only when needed** - Use the workspace-approved Beads/Dolt flow instead of `git push`:
   ```bash
   bd dolt commit -m "checkpoint" && bd dolt pull && bd dolt push
   ```
5. **Clean up** - Clear stashes, prune remote branches, and remove transient smoke artifacts/windows
6. **Verify** - All intended local commits exist and Beads state is synced when applicable
7. **Hand off** - Provide context for next session in the relevant `bd` issue comments

**CRITICAL RULES:**

- `git push` is forbidden from this workspace unless the user explicitly overrides that policy
- Do not claim a remote push happened when it did not
- Do not say "ready to push when you are" about git remotes in this workspace
- If Beads/Dolt sync is blocked, capture the blocker evidence in `bd` and stop retry loops

<!-- END BEADS INTEGRATION -->
