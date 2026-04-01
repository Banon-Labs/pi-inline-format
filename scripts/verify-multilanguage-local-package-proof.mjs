import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ensurePackageSourceMaterialized } from "./ensure-package-source.mjs";

const LOCAL_ROOT_SOURCE = "../../pi-inline-format-extensions";
const SCENARIOS = [
  {
    key: "python",
    model: "canonical-heredoc-compare",
    prompt:
      "Use bash to run python from a heredoc with python3. Keep the transcript inline and normal.",
    requiredCommandSnippets: [
      "python3 <<'PY'",
      "#!/usr/bin/env python3",
      "def main() -> None:",
      'print("hello from py")',
      'if __name__ == "__main__":',
      "main()",
      "PY",
    ],
    expectedToolResultIncludes: "hello from py",
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
      "Use bash to run typescript from a heredoc with npx tsx. Keep the transcript inline and normal.",
    requiredCommandSnippets: [
      "npx tsx <<'TS'",
      "type Answer = {",
      "const answer: Answer = { value: 42 };",
      'console.log("hello from ts", answer.value);',
      "TS",
    ],
    expectedToolResultIncludes: "hello from ts 42",
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
const originalRaw = readFileSync(settingsPath, "utf8");
const originalSettings = JSON.parse(originalRaw);
const originalSource = getFirstPackageSource(originalSettings);

assert(
  originalSource,
  `Expected ${settingsPath} to define at least one package source.`,
);

try {
  const nextSettings = JSON.parse(originalRaw);
  assert(
    Array.isArray(nextSettings.packages) && nextSettings.packages.length > 0,
    `Expected ${settingsPath} to define at least one package entry.`,
  );

  nextSettings.packages[0].source = LOCAL_ROOT_SOURCE;
  writeFileSync(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");

  ensurePackageSourceMaterialized(repoRoot, LOCAL_ROOT_SOURCE);

  const listResult = runPi(["list"]);
  assert(
    listResult.stdout.includes(`Project packages:\n  ${LOCAL_ROOT_SOURCE}`),
    [
      `Expected pi list to report the project package source ${LOCAL_ROOT_SOURCE}.`,
      "--- stdout ---",
      listResult.stdout.trim(),
    ].join("\n"),
  );

  for (const scenario of SCENARIOS) {
    verifyScenario(scenario);
  }
} finally {
  writeFileSync(settingsPath, originalRaw, "utf8");
}

assert.equal(
  readFileSync(settingsPath, "utf8"),
  originalRaw,
  `Expected ${settingsPath} to be restored after multi-language local package proof.`,
);

console.log(
  [
    "Multi-language local package proof passed.",
    `source=${LOCAL_ROOT_SOURCE}`,
    `restored=${originalSource}`,
    `scenarios=${SCENARIOS.map((scenario) => scenario.key).join(",")}`,
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

function getFirstPackageSource(settings) {
  return Array.isArray(settings.packages) && settings.packages.length > 0
    ? settings.packages[0]?.source
    : undefined;
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
