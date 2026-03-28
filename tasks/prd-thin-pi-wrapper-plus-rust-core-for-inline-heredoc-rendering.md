# PRD: Thin Pi Wrapper Plus Rust Core for Inline Heredoc Rendering

## 1. Introduction / Overview

This feature adds inline rendering support for nested code content in Pi assistant output, starting from shell-style transcripts that contain embedded code blocks such as Python heredocs. The system should detect nested languages in transcript-like output, separate the outer shell wrapper from the inner code, and render the inner block with the correct language semantics. The Pi-facing TypeScript extension layer should stay thin, while parsing and performance-sensitive logic should live in a Rust core invoked through a CLI.

## 2. Goals

- Detect nested language regions inside transcript-like Pi output.
- Render embedded code, such as Python inside bash heredocs, as a distinct language-aware block.
- Keep the Pi extension wrapper minimal and move parsing logic into Rust.
- Establish a reusable structure that can support more nested-language patterns later.
- Ensure strict TypeScript and Rust quality gates continue to pass.

## 3. User Stories

### US-001: Define the Rust transcript analysis contract

**Description:** As a developer, I want a stable Rust CLI contract for transcript analysis so that the Pi extension can depend on a strict, testable parsing interface.

**Acceptance Criteria:**

- [ ] The Rust core accepts transcript input and returns structured JSON describing detected language regions.
- [ ] The JSON schema includes enough information to distinguish outer transcript language from embedded code language.
- [ ] The contract is documented in repo docs or code comments where future iterations can find it.
- [ ] `npm run check` passes.

### US-002: Detect nested language regions from transcript-like Pi output

**Description:** As a user, I want nested language regions detected from Pi-style transcript text so that embedded code can be rendered correctly.

**Acceptance Criteria:**

- [ ] The Rust core detects at least one embedded language inside a shell transcript containing a heredoc.
- [ ] A transcript containing `python - <<'PY' ... PY` is identified as containing both bash and python regions.
- [ ] The detection logic is covered by Rust tests for at least one positive and one negative case.
- [ ] `npm run check` passes.

### US-003: Separate shell wrapper content from embedded code content

**Description:** As a user, I want the shell wrapper and the embedded code separated so that the Python body is not treated as plain bash text.

**Acceptance Criteria:**

- [ ] The analysis output contains region boundaries or equivalent metadata for wrapper-versus-embedded content.
- [ ] The extracted embedded code text for a Python heredoc excludes heredoc markers and shell prompt noise when appropriate.
- [ ] The extraction behavior is covered by tests.
- [ ] `npm run check` passes.

### US-004: Integrate the Rust CLI through a thin Pi extension wrapper

**Description:** As a developer, I want the Pi extension to call the Rust CLI through a minimal wrapper so that TypeScript remains Pi-facing and small.

**Acceptance Criteria:**

- [ ] The TypeScript extension invokes the Rust CLI instead of reimplementing parsing logic in TypeScript.
- [ ] TypeScript only maps Pi-facing input/output and does not duplicate transcript parsing logic.
- [ ] Integration errors are surfaced clearly enough for debugging.
- [ ] `npm run check` passes.

### US-005: Render embedded code as a distinct language-aware output block

**Description:** As a user, I want embedded Python code shown separately from the surrounding bash transcript so that inline output is easier to read.

**Acceptance Criteria:**

- [ ] A bash transcript with an embedded Python heredoc produces a distinct Python-oriented rendered block or equivalent structured output used for rendering.
- [ ] The surrounding bash wrapper remains available without collapsing the embedded code back into plain shell text.
- [ ] The first supported example is demonstrated with a Python heredoc inside bash output.
- [ ] `npm run check` passes.

### US-006: Generalize the design for more nested-language patterns

**Description:** As a developer, I want the architecture to support additional nested-language transcript patterns later so that the implementation does not lock into Python-only assumptions.

**Acceptance Criteria:**

- [ ] The Rust analysis model does not hardcode a Python-only result shape.
- [ ] The implementation documents or encodes a path for supporting additional nested-language patterns later.
- [ ] At least one part of the interface uses generic naming such as regions, languages, or blocks rather than Python-specific terminology.
- [ ] `npm run check` passes.

## 4. Functional Requirements

1. **FR-1:** The system must accept transcript-like Pi output as input for nested-language analysis.
2. **FR-2:** The system must detect embedded language regions within an outer transcript language when reliable markers exist.
3. **FR-3:** The system must identify Python heredocs inside bash transcripts as a supported initial example.
4. **FR-4:** The system must produce structured output that distinguishes outer wrapper content from embedded code content.
5. **FR-5:** The Pi extension wrapper must call the Rust core through a CLI for the first delivery.
6. **FR-6:** The TypeScript layer must remain thin and avoid reimplementing transcript parsing logic.
7. **FR-7:** The system must expose enough structured information for language-aware rendering of extracted embedded code.
8. **FR-8:** The Rust core must include automated tests for supported nested-language detection behavior.
9. **FR-9:** The project must continue to satisfy centralized TypeScript and Rust strictness rules, including unused-code errors.

## 5. Non-Goals (Out of Scope)

- Full Pi core rewrites.
- Support for every possible nested-language syntax in the first delivery.
- N-API/native Node bindings in the first delivery.
- Rich visual redesign of all Pi assistant message rendering.
- Solving unrelated markdown or non-transcript rendering issues.

## 6. Design Considerations

- Preserve the current project rule that the TypeScript layer should be Pi-facing and minimal.
- Prefer structured rendering data over brittle text rewriting when possible.
- Keep output understandable enough for future custom renderer work if the first iteration stops at structured output.

## 7. Technical Considerations

- The integration shape for the first delivery is a Rust CLI invoked by the Pi extension wrapper.
- Parsing and performance-sensitive logic should live in Rust.
- Lint and type policies should remain centralized in `tsconfig.json`, `eslint.config.mjs`, and `rust/Cargo.toml`.
- The design should be generic enough to support more nested-language transcript patterns after Python heredocs.

## 8. Success Metrics

- A Python heredoc inside bash transcript input is detected as containing both bash and python.
- The embedded Python body can be separated from the bash wrapper for rendering purposes.
- The TypeScript wrapper remains small and parsing logic stays in Rust.
- `npm run check` passes after implementation.

## 9. Open Questions

- Should the first rendering delivery modify assistant message rendering directly, or first emit structured message/tool output that a renderer consumes?
- How should ambiguous transcripts be handled when nested-language markers are incomplete or malformed?
- Which next nested-language patterns should follow Python heredocs after the initial implementation?
