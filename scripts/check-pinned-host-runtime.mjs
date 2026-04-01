import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { ensurePackageSourceMaterialized } from "./ensure-package-source.mjs";

const EXPECTED_SOURCE = "git:github.com/Banon-Labs/pi-inline-format-extensions@v0.1.4";
const SCENARIOS = [
  {
    key: "python",
    model: "canonical-heredoc-compare",
    prompt:
      "Use bash to run python from a heredoc with python3. Use PY as the heredoc delimiter exactly. Keep the transcript inline and normal.",
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
      "Use bash to run javascript from a heredoc with node. Use JS as the heredoc delimiter exactly. Keep the transcript inline and normal.",
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
      "Use bash to run typescript from a heredoc with npx tsx. Use TS as the heredoc delimiter exactly. Keep the transcript inline and normal.",
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
      "Use bash to run shell from a heredoc with bash. Use SH as the heredoc delimiter exactly. Keep the transcript inline and normal.",
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
  if (messages.length > 0) {
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages[0]?.content?.[0]?.text, scenario.prompt);
  }
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
