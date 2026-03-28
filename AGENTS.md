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
