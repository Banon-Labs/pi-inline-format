# pi-inline-format

[![check](https://github.com/Banon-Labs/pi-inline-format/actions/workflows/check.yml/badge.svg)](https://github.com/Banon-Labs/pi-inline-format/actions/workflows/check.yml)

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

It currently runs four layers:

1. `npm run verify:host-source-upgrade-path`
   - explicitly rehearses the reversible local-path to pinned-git migration flow,
   - proves the pinned host source still loads,
   - proves deterministic compare still works after the source switch,
   - restores `.pi/settings.json` automatically,
   - in CI, runs after the workflow materializes the legacy `../pi-inline-format-extensions` sibling checkout expected by the rehearsal.
2. `npm run check:pinned-host-runtime`
   - covers the headless deterministic regression path for the pinned host source.
3. `npm run check:ansi-capture-proof`
   - runs the tmux-based ANSI capture proof harness,
   - consumes the new `replay.ansi` and `observer.capture` artifacts,
   - verifies that color-sensitive proof survives the ANSI-preserving `tmux capture-pane -e` bridge for python, javascript, typescript, and bash.
4. `npm run check:core`
   - covers linting, formatting, TypeScript checks, and all Rust checks/tests.

Use this split to interpret failures:

- upgrade-path rehearsal failures usually indicate package-source or migration regressions,
- `check:pinned-host-runtime` failures usually indicate package-backed host/runtime regressions before TUI/tmux proof is involved,
- `check:ansi-capture-proof` failures usually indicate the ANSI-preserving proof bridge or color-sensitive transcript evidence regressed,
- `check:core` failures usually indicate repo-local diagnostics or Rust/tooling issues rather than package-source wiring.

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

Deterministic compare for live tmux A/B checks is owned by the package-backed host runtime loaded from `.pi/settings.json`, not by repo-local provider files.

Current deterministic provider surface:

- Provider: `inline-deterministic`
- Scenario models:
  - `canonical-heredoc-compare` — Python
  - `javascript-heredoc-compare` — JavaScript
  - `typescript-heredoc-compare` — TypeScript
  - `bash-heredoc-compare` — shell/bash
- Default prompt/model pair:
  - prompt: `Use bash to run python from a heredoc with python3. Use PY as the heredoc delimiter exactly. Keep the transcript inline and normal.`
  - model: `inline-deterministic/canonical-heredoc-compare`
- Commands:
  - `/inline-format-use-deterministic-model [scenario]` — switches the current session to the package-backed deterministic compare model for `python`, `javascript`, `typescript`, or `bash`.
  - `/inline-format-run-deterministic-compare [scenario]` — switches to the requested deterministic scenario and submits its matching prompt with no real LLM call.
  - `/inline-format-deterministic-status` — shows the provider, available scenarios/models, default prompt, and helper commands.

Verification in this repo:

- `npm run check:pinned-host-runtime`
  - makes sure the pinned public package still serves the shipped Python, JavaScript, TypeScript, and bash proof paths.
- `npm run verify:multilanguage-local-package-proof`
  - temporarily switches `.pi/settings.json` to the local root package source `../../pi-inline-format-extensions`,
  - checks the Python/JavaScript/TypeScript/bash scenarios,
  - and switches back to the pinned git source automatically.
- `npm run smoke:javascript-highlight-compare`
  - opens a tmux session with the same JavaScript heredoc on both sides,
  - left pane = the current pinned package,
  - right pane = your local checkout,
  - keeps the normal bash tool row,
  - keeps the same source text,
  - and shows whether the local version changes highlighting only.
- `npm run smoke:typescript-highlight-compare`
  - does the same side-by-side check for the TypeScript heredoc scenario.

Extra inspection commands exposed by the pinned host package:

- `/inline-format-intel-status` — shows which language backends are available.
- `/inline-format-inspect-sample <scenario>` — inspects a built-in sample heredoc.
- `/inline-format-explain-symbol <scenario> <symbol>` — explains a symbol in a sample heredoc.
- `/inline-format-find-definition <scenario> <symbol>` — finds where a symbol comes from in a sample heredoc.
- `/inline-format-highlight-symbol <scenario> <symbol>` — shows matching symbol ranges in a sample heredoc.
- `/inline-format-semantic-tokens <scenario>` — shows the raw token data for JS/TS.
- `/inline-format-diagnostics-sample <scenario>` — shows diagnostics for a sample heredoc.

Pi-facing entrypoints exposed from `extensions/index.ts`:

- `/inline-format-status` — reports that the project-local diagnostics wrapper is wired to the Rust CLI.
- `/inline-format-analyze` — analyzes either the provided transcript argument or a built-in heredoc sample.
- `/inline-format-render` — renders the transcript as distinct language-aware markdown code fences derived from Rust `render_blocks`.
- `analyze_inline_transcript` — Pi tool that returns the full Rust JSON contract for a raw transcript.
- `render_inline_transcript` — Pi tool that returns markdown-ready output plus structured `render_blocks` for downstream rendering.
- package-backed host runtime seams — loaded from `.pi/settings.json`, currently owning the built-in `bash` override, deterministic compare helpers, and summary suppression behavior for the normal Pi user flow.

## Heredoc language support

Bash heredocs can hold almost any text. This table is about what **this package** knows how to recognize and highlight today.

### What kind of highlighting do you get?

- **Basic highlighting** = the package detects the heredoc and Pi colors it like normal code.
- **Smarter highlighting** = the package keeps the same source text and layout, but adds stronger emphasis to important symbols in the normal bash tool row.
- **Inspection backend** = the package has a language-aware backend that can inspect the extracted snippet, even if the final tool row still uses basic highlighting.

### Canonical package-backed capability tables

The package-backed capability tables now live in the host/package repo:

- [Shipped today](https://github.com/Banon-Labs/pi-inline-format-extensions#shipped-today)
- [Researched next candidates](https://github.com/Banon-Labs/pi-inline-format-extensions#researched-next-candidates)

Use `pi-inline-format-extensions` as the source of truth for:

- which heredoc languages are currently shipped,
- which languages have real or partial inspection backends,
- and which next-language candidates were researched but are not wired yet.

This repo keeps the Rust-core and repo-local diagnostics documentation, while the package-backed capability matrix is maintained in `Banon-Labs/pi-inline-format-extensions`.

This repo still exposes `extensions/index.ts` through `package.json` because the repo-local Rust diagnostics remain a valid direct local entrypoint.

For normal package-backed development, project-scoped `.pi/settings.json` now loads both:

- host package source: `git:github.com/Banon-Labs/pi-inline-format-extensions@v0.1.5`
- local diagnostics extension: `../extensions/index.ts`

This split keeps reusable runtime behavior in the pinned git-backed host package while preserving repo-local Rust CLI diagnostics inside `pi-inline-format`.

The intended stable release-time source is the pinned git ref above, resolved through the root-level Pi package surface in `Banon-Labs/pi-inline-format-extensions`.

For unpublished host changes under active development, the preferred local package source is now the repo root:

- `../../pi-inline-format-extensions`

That root-level local path matches the same package surface used by future pinned git installs. The older `../../pi-inline-format-extensions/packages/host` path remains relevant only as a historical migration source validated by `npm run verify:host-source-upgrade-path`.

## Quick install in another project

If you are a normal user and just want the feature, install **only the published npm package**:

- [`npm:@banon-labs/pi-inline-format-extensions@0.1.5`](https://www.npmjs.com/package/@banon-labs/pi-inline-format-extensions)

If you need an exact repository build instead of the published package, the pinned git source remains available as an advanced fallback.

If that package is **not** in `.pi/settings.json`, this feature will not load.

You do **not** need:

- `../extensions/index.ts`
- `pi-tmux`
- `pi-semaphore`
- any other local Pi package from this workspace

Create `.pi/settings.json` with just the published npm package source:

```json
{
  "packages": [
    {
      "source": "npm:@banon-labs/pi-inline-format-extensions@0.1.5",
      "skills": [],
      "prompts": [],
      "themes": []
    }
  ]
}
```

Then, in that project:

```bash
pi list
pi
```

Inside Pi, these are good quick checks:

- `/inline-format-host-status`
- `/inline-format-run-deterministic-compare javascript`

That should show:

- the package under `Project packages` in `pi list`,
- host status text from the installed package,
- and the normal inline JavaScript heredoc row with `hello from js 42`.

> This install path was validated in a clean temp project with no repo-local diagnostics extension loaded. The repo-local development flow below still uses a pinned git ref because current consumer-regression scripts are anchored to an exact host commit.

## ANSI example: Python before and after install

This is the same Python heredoc prompt in two states:

- **Before**: deterministic provider only, no package-installed bash override.
- **After**: pinned package installed in `.pi/settings.json`.

The source text stays the same. The difference is that the installed package gives the Python body real syntax colors instead of one plain tool-colored block.

**Before**

```text
\x1b[1m\x1b[38;2;208;144;96mdef main() -> None:\x1b[0m
\x1b[1m\x1b[38;2;208;144;96m    print("hello from /tmp/delete.me.py")\x1b[0m
```

**After**

```text
\x1b[38;2;86;156;214mdef\x1b[39m \x1b[38;2;220;220;170mmain\x1b[39m() -> \x1b[38;2;181;206;168mNone\x1b[39m:
\x1b[38;2;78;201;176mprint\x1b[39m(\x1b[38;2;206;145;120m"hello from /tmp/delete.me.py"\x1b[39m)
```

These examples came from a clean install proof run captured in tmux.

## Consumer install/update/migration flow

For normal users, prefer the npm package source above. The remaining pinned-git instructions in this repo are for repo-local development, release rehearsal, and exact-commit rollback.

## Repo-local development flow

The section below is **for this repo only**.

If you are developing inside `pi-inline-format`, keep the pinned package **and** the local diagnostics extension:

```json
{
  "packages": [
    {
      "source": "git:github.com/Banon-Labs/pi-inline-format-extensions@v0.1.5",
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

1. Land and publish the host-side changes in `pi-inline-format-extensions` first.
2. Replace the `packages[0].source` value in `.pi/settings.json` with the new pinned git ref.
3. Keep `extensions[0]` set to `../extensions/index.ts`.
4. Run `pi list` and confirm the new pinned source appears under `Project packages`.
5. Run `npm run check`.
6. If the host change expanded language support or deterministic proof behavior, rerun the relevant proof flow before calling the repin complete.

## ANSI-preserving tmux proof helper

For color-sensitive proof that should survive beyond a live pane, use:

```bash
npm run smoke:ansi-capture-proof
```

Default behavior:

- launches a deterministic target Pi pane in this repo,
- runs `/inline-format-run-deterministic-compare typescript`,
- launches an observer Pi pane,
- extracts ANSI-rich proof lines into a replay pane, then captures that replay pane with ANSI-preserving `tmux capture-pane -e`,
- validates that the observer capture artifact still contains ANSI-highlighted TypeScript output,
- writes artifacts under `/tmp/pi-inline-smoke-ansi-capture-*/`.

Useful flags:

- `--scenario python|javascript|typescript|bash`
- `--keep-open` to leave the dedicated smoke session running for inspection

This helper is for proofing the capture bridge itself. It complements, rather than replaces, the existing deterministic grid smoke and raw `PI_TUI_WRITE_LOG` artifacts. The automated harness entrypoint is `npm run check:ansi-capture-proof`.

### Pre-release local-root validation flow

Before publishing a new host ref, validate against the local root package surface:

1. point `packages[0].source` at `../../pi-inline-format-extensions`,
2. keep `../extensions/index.ts` unchanged,
3. run `npm run verify:multilanguage-local-package-proof`,
4. restore the pinned git source after validation.

This flow is specifically for unpublished host work. Stable consumer installs should continue to use pinned git refs, not an unpinned sibling checkout.

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
