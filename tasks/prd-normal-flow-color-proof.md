# PRD: Normal-Flow Color Proof for Inline Heredoc Rendering

## 1. Introduction/Overview

This feature closes the remaining validation gap for `pi-inline-format`: the repo must prove that inline heredoc rendering works in the **normal Pi user flow**, not only through helper commands or internal render tools. Success requires both structural correctness and color-aware evidence that embedded Python is rendered distinctly from the surrounding bash transcript.

## 2. Goals

- Prove that the canonical Pi prompt triggers inline heredoc rendering in the normal user flow.
- Prove that wrapper bash content and embedded Python content remain visually distinct.
- Define explicit pass/fail criteria for color-aware rendering validation.
- Require durable proof artifacts that future iterations and reviewers can inspect.

## 3. User Stories

### US-001: Trigger inline heredoc rendering from the normal Pi user flow

**Description:** As a user, I want the canonical prompt to trigger inline heredoc rendering in the normal Pi conversation flow so that I do not need helper-only commands to see the feature.

**Acceptance Criteria:**

- [ ] In a real Pi session with the extension loaded, the canonical prompt `Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py` triggers the repo's inline rendering path.
- [ ] Validation uses the normal Pi user flow rather than `/inline-format-render`, custom tools, or raw Rust CLI output alone.
- [ ] The exact prompt and tmux session name used for validation are recorded.
- [ ] `npm run check` passes.

### US-002: Preserve distinct wrapper-versus-embedded rendering in the normal flow

**Description:** As a user, I want the surrounding bash wrapper and embedded Python body to stay visually separate in the normal flow so that the output is easier to read and inspect.

**Acceptance Criteria:**

- [ ] The normal-flow rendered output shows the surrounding bash wrapper and embedded Python body as distinct blocks or equivalent distinct structured output.
- [ ] The embedded Python body is not collapsed back into plain shell text.
- [ ] Structural proof from the validation session is recorded in a durable artifact or notes.
- [ ] `npm run check` passes.

### US-003: Produce color-aware proof artifacts for rendering validation

**Description:** As a developer, I want a repeatable color-aware proof artifact so that I can judge whether syntax-color rendering actually succeeded.

**Acceptance Criteria:**

- [ ] The normal-flow validation captures a color-preserving artifact, such as ANSI-preserving tmux capture, terminal recording, screenshot, or equivalent proof that preserves styling information.
- [ ] The artifact is judged against an explicit pass/fail rubric.
- [ ] The rubric requires all of the following for PASS:
  - [ ] the normal user flow triggered the rendering path,
  - [ ] wrapper bash and embedded Python are visibly separated,
  - [ ] the embedded block is rendered as Python rather than plain shell text,
  - [ ] the artifact preserves ANSI or equivalent color information,
  - [ ] at least two visually distinct syntax token styles appear inside the embedded Python block,
  - [ ] the embedded Python styling is visibly distinct from the surrounding bash wrapper.
- [ ] The artifact path or proof method is recorded in progress notes.
- [ ] `npm run check` passes.

## 4. Functional Requirements

1. **FR-1:** The system must validate the canonical heredoc prompt in the normal Pi interaction flow.
2. **FR-2:** The system must treat helper-only success as insufficient for completion.
3. **FR-3:** The system must preserve distinct wrapper-versus-embedded rendering in the normal flow.
4. **FR-4:** The system must generate or reference a color-preserving proof artifact for rendering evaluation.
5. **FR-5:** The system must define explicit pass/fail criteria for evaluating the proof artifact.

## 5. Non-Goals (Out of Scope)

- Adding broad support for unrelated rendering features outside the heredoc proof path.
- Rewriting Pi core rendering broadly unless the normal-flow proof shows that core changes are required.
- Treating helper commands, parser JSON, or Rust CLI output alone as final proof.

## 6. Design Considerations

- Reuse the existing normal-flow canonical prompt for validation.
- Keep the TypeScript layer Pi-facing and thin.
- Prefer the existing Rust contract and render-block model rather than inventing Python-specific TypeScript parsing.

## 7. Technical Considerations

- Proof artifacts may come from ANSI-preserving tmux capture, terminal recordings, screenshots, or equivalent methods that preserve style information.
- The proof method must be durable enough that a reviewer can inspect it after the loop iteration finishes.
- If the normal user flow still does not trigger the rendering path, the implementation may need additional built-in tool override or message-render integration.

## 8. Success Metrics

- The canonical prompt produces the intended rendered output in a real Pi session.
- A reviewer can inspect a preserved artifact and apply a clear PASS/FAIL rubric.
- Loop completion only occurs after both structural and color-aware proof exist.

## 9. Open Questions

- Which artifact format is the most reliable long-term for preserving terminal styling: ANSI capture, HTML conversion, image screenshot, or a combination?
- Is built-in `bash` tool override sufficient for all normal-flow paths, or is additional message-render integration needed?
