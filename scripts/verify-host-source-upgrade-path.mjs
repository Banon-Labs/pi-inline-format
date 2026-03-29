import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const LOCAL_SOURCE = "../../pi-inline-format-extensions/packages/host";
const PINNED_SOURCE =
  "git:github.com/Banon-Labs/pi-inline-format-extensions@8d2b88dd09fc812141415177a8fad492dd94a140";
const CANONICAL_PROMPT =
  "Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py";
const PI_COMPARE_ARGS = [
  "--offline",
  "--no-session",
  "--no-skills",
  "--no-prompt-templates",
  "--no-themes",
  "--mode",
  "json",
  "-p",
  "/inline-format-run-deterministic-compare",
];

const repoRoot = process.cwd();
const settingsPath = path.join(repoRoot, ".pi", "settings.json");
const originalRaw = readFileSync(settingsPath, "utf8");
const originalSettings = JSON.parse(originalRaw);
const originalSource = getFirstPackageSource(originalSettings);
const verifiedSources = [];

assert(
  originalSource,
  `Expected ${settingsPath} to define at least one package source.`,
);

try {
  verifySource(LOCAL_SOURCE);
  verifySource(PINNED_SOURCE);
} finally {
  writeFileSync(settingsPath, originalRaw, "utf8");
}

assert.equal(
  readFileSync(settingsPath, "utf8"),
  originalRaw,
  `Expected ${settingsPath} to be restored after upgrade-path rehearsal.`,
);

console.log(
  [
    "Host source upgrade-path rehearsal passed.",
    `verified=${verifiedSources.join(",")}`,
    `restored=${originalSource}`,
    `rollback=restore .pi/settings.json package source to ${originalSource}`,
  ].join(" "),
);

function verifySource(source) {
  const nextSettings = JSON.parse(originalRaw);
  assert(
    Array.isArray(nextSettings.packages) && nextSettings.packages.length > 0,
    `Expected ${settingsPath} to define at least one package entry.`,
  );

  nextSettings.packages[0].source = source;
  writeFileSync(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");

  const listResult = runPi(["list"]);
  assert(
    listResult.stdout.includes(`Project packages:\n  ${source}`),
    [
      `Expected pi list to report the project package source ${source}.`,
      "--- stdout ---",
      listResult.stdout.trim(),
    ].join("\n"),
  );

  const compareResult = runPi(PI_COMPARE_ARGS);
  assertDeterministicCompare(compareResult.stdout, source);
  verifiedSources.push(source);
}

function assertDeterministicCompare(stdout, source) {
  const events = parseJsonLines(stdout);
  assert(
    events.length > 0,
    `Expected JSON events from deterministic compare command for ${source}.`,
  );

  const agentEnd = events.find((event) => event.type === "agent_end");
  assert(
    agentEnd,
    `Expected an agent_end event from deterministic compare command for ${source}.`,
  );

  const messages = Array.isArray(agentEnd.messages) ? agentEnd.messages : [];
  assert.equal(
    messages.length,
    4,
    `Expected 4 final messages for ${source}, got ${messages.length}.`,
  );
  assert.equal(messages[0]?.role, "user");
  assert.equal(messages[0]?.content?.[0]?.text, CANONICAL_PROMPT);

  const toolCallMessage = messages[1];
  assert.equal(toolCallMessage?.role, "assistant");
  assert.equal(toolCallMessage?.provider, "inline-deterministic");
  assert.equal(toolCallMessage?.model, "canonical-heredoc-compare");
  assert.equal(toolCallMessage?.content?.[0]?.name, "bash");

  const bashCommand = toolCallMessage?.content?.[0]?.arguments?.command;
  assert.equal(
    typeof bashCommand,
    "string",
    `Expected a bash command string for ${source}.`,
  );
  assert(
    bashCommand.includes("cat > /tmp/delete.me.py <<'PY'"),
    `Expected deterministic bash command to write the canonical heredoc for ${source}.`,
  );

  const toolResultMessage = messages[2];
  assert.equal(toolResultMessage?.role, "toolResult");
  assert.equal(toolResultMessage?.toolName, "bash");
  assert.equal(toolResultMessage?.isError, false);
  assert.equal(toolResultMessage?.content?.[0]?.text, "(no output)");

  const finalAssistantMessage = messages[3];
  assert.equal(finalAssistantMessage?.role, "assistant");
  assert.equal(finalAssistantMessage?.provider, "inline-deterministic");
  assert.equal(finalAssistantMessage?.model, "canonical-heredoc-compare");
  assert.deepEqual(finalAssistantMessage?.content, []);
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
