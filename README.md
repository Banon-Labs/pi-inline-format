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
├── rust/              # Rust core crate
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
  ]
}
```

Contract notes:

- `regions` is ordered and generic so later iterations can add more nested-language patterns.
- `role` distinguishes outer transcript content from embedded code content.
- `language` identifies the rendering language for each region.
- `start_byte` and `end_byte` preserve original transcript boundaries for later extraction/rendering work.
- For `python - <<'PY' ... PY`, the embedded Python region excludes the heredoc opener and terminator so wrapper content stays in outer bash regions.
- The first embedded-language detection case is `python - <<'PY' ... PY` inside a bash transcript.

## TypeScript wrapper integration

The Pi extension keeps TypeScript Pi-facing and delegates transcript analysis to `extensions/rust-cli.ts`.
That helper:

- prefers a fresh Rust CLI binary from `rust/target/...` when one is newer than the Rust sources,
- falls back to `cargo run --manifest-path rust/Cargo.toml --quiet --bin pi-inline-format-core` when no fresh binary is available,
- sends the raw transcript to stdin,
- validates the JSON response shape before returning it to the Pi-facing layer,
- includes the invoked command in thrown errors so integration failures are easier to debug.

Pi-facing entrypoints exposed from `extensions/index.ts`:

- `/inline-format-status` — reports that the thin wrapper is wired to the Rust CLI.
- `/inline-format-analyze` — analyzes either the provided transcript argument or a built-in heredoc sample.
- `analyze_inline_transcript` — Pi tool that returns the Rust JSON contract for a raw transcript.

## Pi package notes

This project is configured as a Pi package via the `pi.extensions` entry in `package.json`.
The package exposes `extensions/index.ts` as the Pi extension entrypoint.
