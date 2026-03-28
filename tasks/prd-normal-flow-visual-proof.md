# PRD: Normal-Flow Visual Proof for Inline Heredoc Rendering

## 1. Introduction / Overview

This feature closes the remaining gap between helper-command success and real product success for `pi-inline-format`. The repo should prove that, in the normal Pi user flow, a bash transcript containing an embedded Python heredoc is automatically rendered as distinct language-aware output, with validation evidence strong enough to evaluate syntax-color success.

## 2. Goals

- Prove the feature works in the normal Pi interaction flow, not only through helper commands.
- Validate the canonical prompt in a live Pi tmux session with the extension loaded.
- Capture structural evidence that outer bash and embedded Python are rendered as separate blocks.
- Capture a color-preserving visual artifact, or an equivalent direct visual proof method, so syntax-color success can be evaluated.
- Keep the TypeScript layer thin and continue using the Rust core for transcript analysis and rendering logic.
- Preserve passing project quality checks.

## 3. User Stories

### US-001: Trigger inline heredoc rendering from the normal Pi user flow

**Description:** As a user, I want the canonical heredoc prompt to trigger inline rendering in the normal Pi flow so that I do not need to call helper commands to see the feature.

**Acceptance Criteria:**

- [ ] In a normal Pi session with the extension loaded, the canonical prompt `Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py` triggers the inline rendering path automatically.
- [ ] The resulting output does not require `/inline-format-render` or direct custom tool invocation to demonstrate the feature.
- [ ] The implementation keeps transcript parsing and render-block generation in Rust instead of duplicating them in TypeScript.
- [ ] `npm run check` passes.

### US-002: Preserve distinct wrapper-versus-embedded rendering in the normal flow

**Description:** As a user, I want the bash wrapper and embedded Python body to remain visually distinct in the normal Pi flow so that the transcript is easier to read.

**Acceptance Criteria:**

- [ ] The normal-flow output shows the surrounding bash wrapper separately from the embedded Python block.
- [ ] The embedded Python body is not collapsed back into plain bash transcript text.
- [ ] Structural evidence of the resulting output is captured in validation notes.
- [ ] `npm run check` passes.

### US-003: Produce color-aware proof artifacts for rendering validation

**Description:** As a developer, I want a repeatable proof method that preserves visual styling information so that I can verify syntax-color behavior instead of relying only on plain text captures.

**Acceptance Criteria:**

- [ ] Validation captures a color-preserving visual artifact, or an explicitly documented equivalent direct visual proof method, for the canonical prompt in a live Pi tmux session.
- [ ] The artifact or proof method is referenced in repo progress notes with the tmux session name and exact validation prompt.
- [ ] The proof is sufficient to evaluate whether syntax-color behavior is present in the rendered result.
- [ ] `npm run check` passes.

## 4. Functional Requirements

1. **FR-1:** The extension must apply the inline heredoc rendering behavior during the normal Pi interaction flow.
2. **FR-2:** The canonical prompt must remain the primary validation scenario for this repo.
3. **FR-3:** The normal-flow output must preserve a distinct embedded Python rendering block apart from bash wrapper content.
4. **FR-4:** Validation must include structural evidence from the real Pi session.
5. **FR-5:** Validation must include a color-preserving visual artifact or an explicitly documented equivalent proof method.
6. **FR-6:** The TypeScript wrapper must remain Pi-facing and thin, while Rust continues to own parsing and rendering logic.
7. **FR-7:** The project must continue to satisfy strict TypeScript and Rust quality gates.

## 5. Non-Goals (Out of Scope)

- Rewriting all Pi message rendering behavior.
- Supporting every possible nested-language transcript pattern in this PRD.
- Replacing the Rust CLI integration with a different runtime integration shape.
- Proving every theme token or every syntax token class in one iteration.

## 6. Design Considerations

- Prefer proof captured from the same user-facing path that real users invoke.
- Keep helper commands available for debugging, but do not treat them as the primary success path.
- Keep proof artifacts practical and easy to rerun during future regressions.

## 7. Technical Considerations

- The normal-flow integration likely depends on built-in Pi tool/message rendering hooks rather than only slash commands.
- Tmux text capture is useful for structural evidence, but may not preserve syntax colors reliably by itself.
- The proof method should explicitly account for this limitation when capturing color-aware validation artifacts.
- Existing `loop.guidance` in `.ralphi/config.yaml` should remain aligned with this PRD.

## 8. Success Metrics

- The canonical prompt demonstrates automatic normal-flow heredoc rendering in Pi.
- The output visibly separates bash wrapper content from embedded Python content.
- A reviewer can inspect a saved artifact or equivalent proof and evaluate whether syntax-color behavior is present.
- `npm run check` passes after implementation.

## 9. Open Questions

- What proof artifact format is most reliable for preserving syntax colors in this environment?
- Should the final proof rely on terminal screenshots, exported HTML, ANSI-preserving capture, or another mechanism?
- Are additional normal-flow transcript cases needed after the canonical heredoc prompt is working?
