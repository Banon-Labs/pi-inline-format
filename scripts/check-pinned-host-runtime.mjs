import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { ensurePackageSourceMaterialized } from "./ensure-package-source.mjs";

const EXPECTED_SOURCE =
  "git:github.com/Banon-Labs/pi-inline-format-extensions@8d2b88dd09fc812141415177a8fad492dd94a140";
const CANONICAL_PROMPT =
  "Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py";
const REQUIRED_COMMAND_SNIPPETS = [
  "cat > /tmp/delete.me.py <<'PY'",
  "#!/usr/bin/env python3",
  "def main() -> None:",
  'print("hello from /tmp/delete.me.py")',
  'if __name__ == "__main__":',
  "main()",
  "PY",
];

const repoRoot = process.cwd();
const settingsPath = path.join(repoRoot, ".pi", "settings.json");
const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
const packageSources = Array.isArray(settings.packages)
  ? settings.packages
      .map((pkg) => pkg?.source)
      .filter((value) => typeof value === "string")
  : [];

assert(
  packageSources.includes(EXPECTED_SOURCE),
  `Expected ${settingsPath} to include pinned host source ${EXPECTED_SOURCE}.`,
);

ensurePackageSourceMaterialized(repoRoot, EXPECTED_SOURCE);

const listResult = runPi(["list"]);
assert(
  listResult.stdout.includes(`Project packages:\n  ${EXPECTED_SOURCE}`),
  [
    "Expected `pi list` to report the pinned project package source.",
    "--- stdout ---",
    listResult.stdout.trim(),
  ].join("\n"),
);

const compareResult = runPi([
  "--no-session",
  "--no-skills",
  "--no-prompt-templates",
  "--no-themes",
  "--model",
  "inline-deterministic/canonical-heredoc-compare",
  "--mode",
  "json",
  "-p",
  CANONICAL_PROMPT,
]);
const events = parseJsonLines(compareResult.stdout);
assert(events.length > 0, "Expected JSON events from deterministic compare command.");

const agentEnd = events.find((event) => event.type === "agent_end");
assert(agentEnd, "Expected an agent_end event from deterministic compare command.");

const messages = Array.isArray(agentEnd.messages) ? agentEnd.messages : [];
assert.equal(messages.length, 4, `Expected 4 final messages, got ${messages.length}.`);
assert.equal(
  messages[0]?.role,
  "user",
  "Expected the first final message to be the canonical user prompt.",
);
assert.equal(
  messages[0]?.content?.[0]?.text,
  CANONICAL_PROMPT,
  "Expected the deterministic compare command to submit the canonical prompt.",
);

const toolCallMessage = messages[1];
assert.equal(
  toolCallMessage?.role,
  "assistant",
  "Expected the second final message to be the assistant tool call.",
);
assert.equal(
  toolCallMessage?.provider,
  "inline-deterministic",
  "Expected the deterministic compare provider to be active.",
);
assert.equal(
  toolCallMessage?.model,
  "canonical-heredoc-compare",
  "Expected the canonical deterministic compare model to be active.",
);
assert.equal(
  toolCallMessage?.content?.length,
  1,
  "Expected a single tool call content entry.",
);
assert.equal(
  toolCallMessage?.content?.[0]?.name,
  "bash",
  "Expected the deterministic compare to call bash.",
);
const bashCommand = toolCallMessage?.content?.[0]?.arguments?.command;
assert.equal(
  typeof bashCommand,
  "string",
  "Expected a bash command string in the deterministic tool call.",
);
for (const snippet of REQUIRED_COMMAND_SNIPPETS) {
  assert(
    bashCommand.includes(snippet),
    `Expected deterministic bash command to include snippet: ${snippet}`,
  );
}

const toolResultMessage = messages[2];
assert.equal(
  toolResultMessage?.role,
  "toolResult",
  "Expected the third final message to be the bash tool result.",
);
assert.equal(
  toolResultMessage?.toolName,
  "bash",
  "Expected the tool result to belong to bash.",
);
assert.equal(
  toolResultMessage?.isError,
  false,
  "Expected deterministic bash execution to succeed.",
);
assert.equal(
  toolResultMessage?.content?.[0]?.text,
  "(no output)",
  "Expected deterministic bash execution to return the canonical no-output result.",
);

const finalAssistantMessage = messages[3];
assert.equal(
  finalAssistantMessage?.role,
  "assistant",
  "Expected the fourth final message to be the final assistant turn.",
);
assert.equal(finalAssistantMessage?.provider, "inline-deterministic");
assert.equal(finalAssistantMessage?.model, "canonical-heredoc-compare");
assert.deepEqual(
  finalAssistantMessage?.content,
  [],
  "Expected no trailing assistant narration after the deterministic bash tool result.",
);

console.log(
  [
    "Pinned host runtime regression check passed.",
    `source=${EXPECTED_SOURCE}`,
    "provider=inline-deterministic",
    "model=canonical-heredoc-compare",
    "tool=bash",
    "result=(no output)",
    "final_assistant_content=[]",
  ].join(" "),
);

function runPi(args) {
  const command = process.platform === "win32" ? "pi.cmd" : "pi";
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `pi ${args.join(" ")} exited with status ${String(result.status)}.`,
        "--- stdout ---",
        result.stdout.trim(),
        "--- stderr ---",
        result.stderr.trim(),
      ].join("\n"),
    );
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseJsonLines(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}
