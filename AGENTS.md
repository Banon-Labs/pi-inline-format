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
