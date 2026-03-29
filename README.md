# pi-inline-format

Strict Pi extension project scaffold with:

- a TypeScript Pi extension entrypoint in `extensions/`
- a Rust core subproject in `rust/`

## Goals

- Follow Pi package and extension conventions
- Keep the Pi-facing wrapper small and type-safe
- Keep parsing/rendering logic in a stricter Rust core
- Enforce strict checks separately for TypeScript and Rust

## Layout

```text
pi-inline-format/
├── extensions/        # Pi extension entrypoint(s)
├── rust/              # Rust core subproject
├── .ralphi/           # Ralph loop config/runtime files
├── eslint.config.mjs
├── package.json
└── tsconfig.json
```

## TypeScript commands

```bash
npm run typecheck
npm run lint
npm run format
```

## Rust commands

```bash
npm run rust:fmt
npm run rust:check
npm run rust:lint
npm run rust:test
```

## Combined check

```bash
npm run check
```

## CI contract

The GitHub Actions `check` workflow is the repository-level guardrail for the package-backed setup.

It currently runs two layers:

1. `npm run verify:host-source-upgrade-path`
   - explicitly rehearses the reversible local-path to pinned-git migration flow,
   - proves the pinned host source still loads,
   - proves deterministic compare still works after the source switch,
   - restores `.pi/settings.json` automatically.
2. `npm run check`
   - covers linting, formatting, TypeScript checks, the pinned-host regression script, and all Rust checks/tests.

Use this split to interpret failures:

- upgrade-path rehearsal failures usually indicate package-source or migration regressions,
- `check:pinned-host-runtime` failures usually indicate package-backed host/runtime regressions,
- Rust or local diagnostics failures usually indicate repo-local diagnostics issues rather than package-source wiring.

## Rust transcript analysis contract

The Rust CLI reads raw transcript text from stdin and prints JSON shaped like:

```json
{
  "regions": [
    {
      "id": "outer-0",
      "role": "outer",
      "language": "bash",
      "start_byte": 0,
      "end_byte": 18
    },
    {
      "id": "embedded-0",
      "role": "embedded",
      "language": "python",
      "start_byte": 18,
      "end_byte": 30
    },
    {
      "id": "outer-1",
      "role": "outer",
      "language": "bash",
      "start_byte": 30,
      "end_byte": 44
    }
  ],
  "render_blocks": [
    {
      "id": "outer-0",
      "role": "outer",
      "language": "bash",
      "content": "$ python - <<'PY'\n"
    },
    {
      "id": "embedded-0",
      "role": "embedded",
      "language": "python",
      "content": "print('hi')\n"
    },
    {
      "id": "outer-1",
      "role": "outer",
      "language": "bash",
      "content": "PY\n$ echo done\n"
    }
  ]
}
```

Contract notes:

- `regions` is ordered and generic so later iterations can add more nested-language patterns.
- `render_blocks` is the render-ready companion to `regions`; each block keeps a renderer's language choice separate from the original byte offsets.
- `role` distinguishes outer transcript content from embedded code content.
- `language` identifies the rendering language for each region or block.
- `start_byte` and `end_byte` preserve original transcript boundaries for later extraction/rendering work.
- The Rust core now drives detection through a generic `NESTED_REGION_PATTERNS` table, so future nested-language additions can plug in new pattern descriptors without changing the JSON contract shape.
- For `python - <<'PY' ... PY`, the embedded Python region excludes the heredoc opener and terminator so wrapper content stays in outer bash regions while `render_blocks` expose a distinct Python block for display.
- The first embedded-language detection case is `python - <<'PY' ... PY` inside a bash transcript.
- The same `PY` heredoc split also supports plain bash file-writing flows such as `cat > /tmp/delete.me.py <<'PY' ... PY`, which is the canonical normal-flow validation prompt for this repo.

## TypeScript wrapper integration

The Pi extension keeps TypeScript Pi-facing and delegates transcript analysis to `extensions/rust-cli.ts`.
That helper:

- prefers a fresh Rust CLI binary from `rust/target/...` when one is newer than the Rust sources,
- falls back to `cargo run --manifest-path rust/Cargo.toml --quiet --bin pi-inline-format-core` when no fresh binary is available,
- sends the raw transcript to stdin,
- validates the JSON response shape before returning it to the Pi-facing layer,
- includes the invoked command in thrown errors so integration failures are easier to debug.

## Deterministic compare helpers

Deterministic compare for live tmux A/B checks is now owned by the package-backed host runtime loaded from `.pi/settings.json`, not by repo-local provider files.

- Provider: `inline-deterministic/canonical-heredoc-compare`
- Prompt: `Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py`
- Commands:
  - `/inline-format-use-deterministic-model` — switches the current session to the package-backed deterministic compare model.
  - `/inline-format-run-deterministic-compare` — switches to the deterministic model and submits the canonical heredoc prompt.
  - `/inline-format-deterministic-status` — shows the provider, model, prompt, and helper commands.

Pi-facing entrypoints exposed from `extensions/index.ts`:

- `/inline-format-status` — reports that the project-local diagnostics wrapper is wired to the Rust CLI.
- `/inline-format-analyze` — analyzes either the provided transcript argument or a built-in heredoc sample.
- `/inline-format-render` — renders the transcript as distinct language-aware markdown code fences derived from Rust `render_blocks`.
- `analyze_inline_transcript` — Pi tool that returns the full Rust JSON contract for a raw transcript.
- `render_inline_transcript` — Pi tool that returns markdown-ready output plus structured `render_blocks` for downstream rendering.
- package-backed host runtime seams — loaded from `.pi/settings.json`, currently owning the built-in `bash` override, deterministic compare helpers, and summary suppression behavior for the normal Pi user flow.

## Pi package notes

This repo still exposes `extensions/index.ts` through `package.json` because the repo-local Rust diagnostics remain a valid direct local entrypoint.

For normal package-backed development, project-scoped `.pi/settings.json` now loads both:

- host package source: `git:github.com/Banon-Labs/pi-inline-format-extensions@8d2b88dd09fc812141415177a8fad492dd94a140`
- local diagnostics extension: `../extensions/index.ts`

This split keeps reusable runtime behavior in the pinned git-backed host package while preserving repo-local Rust CLI diagnostics inside `pi-inline-format`.

The intended stable release-time source is now the pinned git ref above, which resolves through the root-level Pi package surface added to `Banon-Labs/pi-inline-format-extensions`.

## Consumer install/update/migration flow

Recommended consumer `.pi/settings.json` shape:

```json
{
  "packages": [
    {
      "source": "git:github.com/Banon-Labs/pi-inline-format-extensions@8d2b88dd09fc812141415177a8fad492dd94a140",
      "skills": [],
      "prompts": [],
      "themes": []
    }
  ],
  "extensions": ["../extensions/index.ts"]
}
```

### What stays local vs package-backed

- Keep the host/runtime package source pinned in `.pi/settings.json`.
- Keep `../extensions/index.ts` loaded locally for repo-local Rust CLI diagnostics.
- Do **not** move the local diagnostics commands into the package source; the package owns runtime seams, while this repo keeps diagnostics.

### Updating the pinned git source

1. Replace the `packages[0].source` value in `.pi/settings.json` with the new pinned git ref.
2. Keep `extensions[0]` set to `../extensions/index.ts`.
3. Run `pi list` and confirm the new pinned source appears under `Project packages`.
4. Run `npm run check`.

### Migrating from the old local sibling path

Older local development used:

- `../../pi-inline-format-extensions/packages/host`

The verified migration path is:

1. start from the old local-path package source above,
2. switch `packages[0].source` to the pinned git source,
3. keep `../extensions/index.ts` unchanged,
4. verify with `npm run verify:host-source-upgrade-path`,
5. finish with `npm run check`.

`npm run verify:host-source-upgrade-path` rehearses the exact transition locally by temporarily switching `.pi/settings.json` from the old local-path source to the pinned git source, running `pi list` plus headless deterministic compare verification at each step, and restoring the original settings file automatically even on failure.

### Rollback note

If a future update fails, restore `.pi/settings.json` to the last known-good package source and rerun:

- `pi list`
- `npm run check`
