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
      "end_byte": 35
    },
    {
      "id": "embedded-0",
      "role": "embedded",
      "language": "python",
      "start_byte": 18,
      "end_byte": 30
    }
  ]
}
```

Contract notes:

- `regions` is ordered and generic so later iterations can add more nested-language patterns.
- `role` distinguishes outer transcript content from embedded code content.
- `language` identifies the rendering language for each region.
- `start_byte` and `end_byte` preserve original transcript boundaries for later extraction/rendering work.
- The first embedded-language detection case is `python - <<'PY' ... PY` inside a bash transcript.

## Pi package notes

This project is configured as a Pi package via the `pi.extensions` entry in `package.json`.
The package exposes `extensions/index.ts` as the Pi extension entrypoint.
