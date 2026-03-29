import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { ensurePackageSourceMaterialized } from "./ensure-package-source.mjs";

const EXPECTED_SOURCE =
  "git:github.com/Banon-Labs/pi-inline-format-extensions@aad3b7e67f98bd52aaa3a78cd2dcb8527d4a8d3f";
const ANSI_SEQUENCE_PATTERN = String.raw`\x1b\[[0-9;]*[A-Za-z]`;
const SCENARIOS = [
  {
    key: "python",
    plainLine: 'print("hello from /tmp/delete.me.py")',
    ansiRegex: new RegExp(String.raw`\x1b\[[0-9;]*mprint\x1b\[39m\(`, "u"),
  },
  {
    key: "javascript",
    plainLine: 'console.log("hello from js", value);',
    ansiRegex: new RegExp(String.raw`\x1b\[[0-9;]*mconsole\x1b\[39m\.log\(`, "u"),
  },
  {
    key: "typescript",
    plainLine: "type Answer = {",
    ansiRegex: new RegExp(String.raw`\x1b\[[0-9;]*mtype\x1b\[39m Answer = \{`, "u"),
  },
  {
    key: "bash",
    plainLine: 'echo "hello from sh"',
    ansiRegex: new RegExp(String.raw`\x1b\[[0-9;]*mecho\x1b\[39m`, "u"),
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

ensureCommandAvailable("tmux");
ensureCommandAvailable("script");
ensureCommandAvailable(process.platform === "win32" ? "pi.cmd" : "pi");
ensurePackageSourceMaterialized(repoRoot, EXPECTED_SOURCE);

const summaries = [];
for (const [index, scenario] of SCENARIOS.entries()) {
  summaries.push(verifyScenario(scenario, index));
}

console.log(
  [
    "ANSI capture proof harness passed.",
    `source=${EXPECTED_SOURCE}`,
    `scenarios=${summaries.map((summary) => summary.key).join(",")}`,
    `artifacts=${summaries.map((summary) => `${summary.key}:${summary.tmpDir}`).join(",")}`,
  ].join(" "),
);

function verifyScenario(scenario, index) {
  const sessionName = `pi-inline-check-ansi-${scenario.key}-${process.pid}-${Date.now()}-${index}`;
  const tmpDir = path.join("/tmp", sessionName);
  runCommand("bash", [
    "./scripts/run-ansi-capture-proof-smoke.sh",
    "--scenario",
    scenario.key,
    "--session-name",
    sessionName,
  ]);

  const replayPath = path.join(tmpDir, "replay.ansi");
  const observerWriteLogPath = path.join(tmpDir, "observer.write.log");
  const observerTranscriptPath = path.join(tmpDir, "observer.typescript");
  const targetWriteLogPath = path.join(tmpDir, "target.write.log");

  for (const artifactPath of [
    replayPath,
    observerWriteLogPath,
    observerTranscriptPath,
    targetWriteLogPath,
  ]) {
    assert(
      existsSync(artifactPath),
      `Expected proof artifact to exist: ${artifactPath}`,
    );
  }

  const replayAnsi = readFileSync(replayPath, "utf8");
  const observerWriteLog = readFileSync(observerWriteLogPath, "utf8");
  const targetWriteLog = readFileSync(targetWriteLogPath, "utf8");

  assert(
    stripAnsi(replayAnsi).includes(scenario.plainLine),
    `Expected replay artifact to contain ${scenario.key} proof line: ${scenario.plainLine}`,
  );
  assert(
    stripAnsi(observerWriteLog).includes(scenario.plainLine),
    `Expected observer write log to contain ${scenario.key} proof line: ${scenario.plainLine}`,
  );
  assert(
    stripAnsi(targetWriteLog).includes(scenario.plainLine),
    `Expected target write log to contain ${scenario.key} proof line: ${scenario.plainLine}`,
  );
  assert(
    scenario.ansiRegex.test(replayAnsi),
    `Expected replay artifact to preserve ANSI-highlighted ${scenario.key} proof content.`,
  );
  assert(
    scenario.ansiRegex.test(observerWriteLog),
    `Expected observer write log to preserve ANSI-highlighted ${scenario.key} proof content.`,
  );

  return {
    key: scenario.key,
    tmpDir,
  };
}

function ensureCommandAvailable(command) {
  const probe = spawnSync(command, ["--help"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });

  if (probe.error?.code === "ENOENT") {
    throw new Error(`Required command not found on PATH: ${command}`);
  }
}

function runCommand(command, args) {
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
        `${command} ${args.join(" ")} exited with status ${String(result.status)}.`,
        "--- stdout ---",
        result.stdout.trim(),
        "--- stderr ---",
        result.stderr.trim(),
      ].join("\n"),
    );
  }

  return result;
}

function stripAnsi(text) {
  return text.replace(new RegExp(ANSI_SEQUENCE_PATTERN, "gu"), "");
}
