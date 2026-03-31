import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { ensurePackageSourceMaterialized } from "./ensure-package-source.mjs";

const EXPECTED_SOURCE =
  "git:github.com/Banon-Labs/pi-inline-format-extensions@04376ffa2c8f0fc5422a73abf4c7fae8ee2960b5";
const SCENARIOS = [
  {
    key: "python",
    model: "canonical-heredoc-compare",
    prompt:
      "Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py",
    requiredCommandSnippets: [
      "cat > /tmp/delete.me.py <<'PY'",
      "#!/usr/bin/env python3",
      "def main() -> None:",
      'print("hello from /tmp/delete.me.py")',
      'if __name__ == "__main__":',
      "main()",
      "PY",
    ],
    expectedToolResult: "(no output)",
  },
  {
    key: "javascript",
    model: "javascript-heredoc-compare",
    prompt:
      "Use bash to run javascript from a heredoc with node. Keep the transcript inline and normal.",
    requiredCommandSnippets: [
      "node <<'JS'",
      "const value = 42;",
      'console.log("hello from js", value);',
      "JS",
    ],
    expectedToolResultIncludes: "hello from js 42",
  },
  {
    key: "typescript",
    model: "typescript-heredoc-compare",
    prompt:
      "Use bash to write typescript to a file using heredocs. Execute into /tmp/delete.me.ts",
    requiredCommandSnippets: [
      "cat > /tmp/delete.me.ts <<'TS'",
      "type Answer = {",
      "const answer: Answer = { value: 42 };",
      "console.log(answer.value);",
      "TS",
    ],
    expectedToolResult: "(no output)",
  },
  {
    key: "bash",
    model: "bash-heredoc-compare",
    prompt:
      "Use bash to run shell from a heredoc with bash. Keep the transcript inline and normal.",
    requiredCommandSnippets: [
      "bash <<'SH'",
      "set -euo pipefail",
      'echo "hello from sh"',
      "SH",
    ],
    expectedToolResultIncludes: "hello from sh",
  },
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

for (const scenario of SCENARIOS) {
  verifyScenario(scenario);
}

console.log(
  [
    "Pinned host runtime regression check passed.",
    `source=${EXPECTED_SOURCE}`,
    `scenarios=${SCENARIOS.map((scenario) => scenario.key).join(",")}`,
    "provider=inline-deterministic",
  ].join(" "),
);

function verifyScenario(scenario) {
  const compareResult = runPi([
    "--no-session",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--model",
    `${"inline-deterministic"}/${scenario.model}`,
    "--mode",
    "json",
    "-p",
    scenario.prompt,
  ]);

  const events = parseJsonLines(compareResult.stdout);
  assert(
    events.length > 0,
    `Expected JSON events from deterministic compare for ${scenario.key}.`,
  );

  const agentEnd = events.find((event) => event.type === "agent_end");
  assert(agentEnd, `Expected agent_end event for ${scenario.key}.`);

  const messages = Array.isArray(agentEnd.messages) ? agentEnd.messages : [];
  assert.equal(
    messages.length,
    4,
    `Expected 4 final messages for ${scenario.key}, got ${messages.length}.`,
  );
  assert.equal(messages[0]?.role, "user");
  assert.equal(messages[0]?.content?.[0]?.text, scenario.prompt);

  const toolCallMessage = messages[1];
  assert.equal(toolCallMessage?.role, "assistant");
  assert.equal(toolCallMessage?.provider, "inline-deterministic");
  assert.equal(toolCallMessage?.model, scenario.model);
  assert.equal(toolCallMessage?.content?.[0]?.name, "bash");

  const bashCommand = toolCallMessage?.content?.[0]?.arguments?.command;
  assert.equal(
    typeof bashCommand,
    "string",
    `Expected a bash command string for ${scenario.key}.`,
  );

  for (const snippet of scenario.requiredCommandSnippets) {
    assert(
      bashCommand.includes(snippet),
      `Expected ${scenario.key} deterministic bash command to include snippet: ${snippet}`,
    );
  }

  const toolResultMessage = messages[2];
  assert.equal(toolResultMessage?.role, "toolResult");
  assert.equal(toolResultMessage?.toolName, "bash");
  assert.equal(toolResultMessage?.isError, false);

  const toolResultText = toolResultMessage?.content?.[0]?.text;
  assert.equal(
    typeof toolResultText,
    "string",
    `Expected a text tool result for ${scenario.key}.`,
  );

  if (scenario.expectedToolResult !== undefined) {
    assert.equal(
      toolResultText,
      scenario.expectedToolResult,
      `Unexpected tool result for ${scenario.key}.`,
    );
  }

  if (scenario.expectedToolResultIncludes !== undefined) {
    assert(
      toolResultText.includes(scenario.expectedToolResultIncludes),
      `Expected ${scenario.key} tool result to include ${scenario.expectedToolResultIncludes}.`,
    );
  }

  const finalAssistantMessage = messages[3];
  assert.equal(finalAssistantMessage?.role, "assistant");
  assert.equal(finalAssistantMessage?.provider, "inline-deterministic");
  assert.equal(finalAssistantMessage?.model, scenario.model);
  assert.deepEqual(
    finalAssistantMessage?.content,
    [],
    `Expected no trailing assistant narration for ${scenario.key}.`,
  );
}

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
