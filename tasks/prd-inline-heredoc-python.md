# PRD: Inline Python Highlighting Inside Canonical Bash Heredoc Transcript

## 1. Introduction / Overview

This feature adds one highly constrained rendering improvement to normal Pi bash transcript output for a single canonical prompt: `Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py`.

For that canonical transcript shape, the final user-visible output must remain visually identical to normal Pi bash rendering except for one change: the heredoc body lines between `<<'PY'` and `PY` should receive normal Python syntax highlighting inline, in place, without changing layout or text.

The purpose is to improve readability of embedded Python while preserving Pi's existing bash transcript appearance exactly.

## 2. Goals

- Preserve normal Pi bash transcript rendering exactly for the canonical prompt.
- Apply Python syntax highlighting only to heredoc body lines between `<<'PY'` and `PY`.
- Keep all non-body bash transcript text, colors, and spacing unchanged.
- Fail loudly when the canonical inline-highlighting path cannot be applied confidently.
- Produce acceptance criteria and validation expectations that are as exhaustive as practical within current repo and environment limits.

## 3. User Stories

### US-001: Detect the canonical bash heredoc transcript shape

**Description:** As a developer, I want the renderer to recognize the canonical transcript shape precisely so that special handling is only applied where intended.

**Acceptance Criteria:**

- [ ] The implementation defines the exact transcript conditions that qualify for the canonical inline-highlighting path.
- [ ] Detection is scoped to a bash transcript containing a heredoc that starts with `<<'PY'` and closes with a standalone `PY` delimiter.
- [ ] Detection does not trigger for unrelated bash output or non-canonical prompts in the first delivery.
- [ ] Failure to match the expected shape is treated as an explicit non-match or error path rather than silent best-effort behavior.
- [ ] `npm run check` passes.

### US-002: Preserve all visible transcript text and layout outside the Python body

**Description:** As a user, I want the transcript to look exactly like normal Pi bash output so that the feature improves readability without changing expected appearance.

**Acceptance Criteria:**

- [ ] The final rendered output preserves all original transcript text before, within, and after the heredoc region.
- [ ] Bounding boxes, padding, margins, spacing, and line ordering remain unchanged from normal Pi output.
- [ ] Surrounding bash lines keep normal bash styling.
- [ ] The heredoc delimiter lines `<<'PY'` and `PY` keep their normal bash styling.
- [ ] No labels, duplicated blocks, explanatory text, visible wrapper/body splits, or alternate presentation are introduced.
- [ ] Verify in browser or equivalent interactive Pi rendering surface used for normal output.
- [ ] `npm run check` passes.

### US-003: Apply Python syntax highlighting only to heredoc body lines

**Description:** As a user, I want only the embedded Python body to be syntax-colored so that the code is easier to read without changing the surrounding shell transcript.

**Acceptance Criteria:**

- [ ] Only lines strictly between the opening `<<'PY'` line and closing `PY` line receive Python syntax highlighting.
- [ ] Python token coloring matches normal Python highlighting behavior used elsewhere by Pi for Python code.
- [ ] Body text content is unchanged; only syntax coloring differs.
- [ ] The opening and closing delimiter lines are not recolored as Python.
- [ ] No surrounding bash lines are recolored as Python.
- [ ] `npm run check` passes.

### US-004: Fail loudly when inline highlighting cannot be applied confidently

**Description:** As a developer, I want explicit failure behavior when the renderer cannot safely preserve exact output so that incorrect partial rendering is not shown silently.

**Acceptance Criteria:**

- [ ] The implementation defines what "fail loudly" means in this repo and rendering path.
- [ ] If the transcript cannot be matched or preserved exactly enough, the system surfaces an explicit error, diagnostic, or blocked-path outcome rather than silently applying partial highlighting.
- [ ] The failure path is covered by at least one automated test or equivalent reproducible validation artifact.
- [ ] The failure mode does not quietly alter transcript layout or styling outside the allowed Python body scope.
- [ ] `npm run check` passes.

### US-005: Validate canonical visual parity and nearby regressions exhaustively within current limits

**Description:** As a maintainer, I want strong proof that the canonical rendering is preserved so that the feature can be trusted despite its tight visual constraints.

**Acceptance Criteria:**

- [ ] Validation includes a before-versus-after comparison for the canonical prompt on the main Pi user chat/output surface.
- [ ] Validation proves identical text and layout outside the Python body region.
- [ ] Validation covers at least one negative case where a non-Python or non-canonical heredoc does not receive the special treatment.
- [ ] Validation covers at least one malformed or incomplete heredoc case that exercises the loud-failure behavior.
- [ ] Validation notes any environment limits that prevent broader proof and states what remains unverified.
- [ ] Verify in browser or equivalent interactive Pi rendering surface used for normal output.
- [ ] `npm run check` passes.

## 4. Functional Requirements

1. **FR-1:** The system must preserve normal Pi bash transcript rendering exactly for the canonical prompt `Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py`, except for Python syntax coloring on the heredoc body.
2. **FR-2:** The system must scope the first delivery to the main Pi user chat/output surface only.
3. **FR-3:** The system must detect only the canonical bash heredoc workflow in the first delivery.
4. **FR-4:** The system must apply Python syntax highlighting only to lines between `<<'PY'` and `PY`.
5. **FR-5:** The system must preserve original transcript text exactly and must not insert or delete user-visible characters.
6. **FR-6:** The system must preserve bounding boxes, padding, margins, spacing, and surrounding colors outside the Python body region.
7. **FR-7:** The system must leave surrounding bash lines and heredoc delimiter lines styled as normal bash transcript content.
8. **FR-8:** The system must not add labels, duplicated blocks, explanatory text, or visible wrapper/body splits.
9. **FR-9:** If exact inline highlighting cannot be applied confidently, the system must fail loudly instead of silently degrading or partially applying the feature.
10. **FR-10:** The implementation must include validation artifacts or tests for the canonical success case, at least one negative case, and at least one failure-path case.
11. **FR-11:** The TypeScript layer must remain Pi-facing and thin, while parsing or performance-sensitive detection stays in Rust where applicable.
12. **FR-12:** The project must continue to satisfy centralized lint, typecheck, and Rust quality policies with no file-level policy bypasses.

## 5. Non-Goals (Out of Scope)

- General syntax highlighting for all heredoc languages.
- Changing transcript layout, spacing, boxes, padding, margins, or colors outside the Python body.
- Adding explanatory labels, wrappers, debug affordances, or duplicate code blocks.
- Auto-detecting arbitrary nested languages beyond Python.
- Supporting non-canonical prompts in the first delivery.
- Expanding the feature to previews, logs, exported views, or other non-primary rendering surfaces in the first delivery.

## 6. Design Considerations

- The user-visible result should be indistinguishable from normal Pi bash output except for Python coloring within the heredoc body.
- The canonical transcript should be treated as the reference rendering fixture for development and review.
- Prefer rendering metadata or region-based annotation over brittle text rewriting if that best preserves layout.
- Preserve the existing project rule that the Pi-facing TypeScript wrapper remains thin.

## 7. Technical Considerations

- Detection and region extraction should remain narrowly scoped for the first delivery to avoid false positives.
- Parsing and performance-sensitive logic should live in the Rust core when possible, consistent with repo conventions.
- The rendering path should reuse Pi's normal Python syntax-highlighting behavior rather than inventing a custom Python color scheme.
- The implementation should document or encode the exact boundary of the highlighted region so delimiter lines remain bash-colored.
- Validation should include interactive proof on the main Pi rendering surface, plus automated checks where feasible.
- Any unverifiable behavior due to environment or tooling limits should be documented explicitly rather than assumed correct.

## 8. Success Metrics

- On the canonical prompt, the final visible Pi output matches normal bash transcript layout and text exactly outside the heredoc body.
- The embedded Python body is syntax-colored inline using normal Python highlighting.
- Non-canonical or malformed cases do not silently receive incorrect partial treatment.
- Reviewers can inspect concrete proof artifacts showing canonical parity and bounded behavior.
- `npm run check` passes after implementation.

## 9. Open Questions

- What exact user-visible mechanism should represent "fail loudly" in the main Pi rendering path for this repo: explicit error output, diagnostic logging plus blocked rendering, or another surfaced failure mode?
- What is the strongest practical visual-diff evidence available in the current environment for proving unchanged boxes, padding, and margins?
- Which internal Pi rendering API or metadata hook is the safest place to inject inline Python coloring without disturbing canonical bash layout?
