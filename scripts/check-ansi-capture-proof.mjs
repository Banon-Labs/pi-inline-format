import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { ensurePackageSourceMaterialized } from "./ensure-package-source.mjs";

const EXPECTED_SOURCE =
  "git:github.com/Banon-Labs/pi-inline-format-extensions@04376ffa2c8f0fc5422a73abf4c7fae8ee2960b5";
const ANSI_SEQUENCE_PATTERN = String.raw`\x1b\[[0-9;]*[A-Za-z]`;
const SCENARIOS = [
  {
    key: "python",
    plainLine: 'print("hello from /tmp/delete.me.py")',
    visibleWaitText: "print",
    ansiRegex: new RegExp(String.raw`\x1b\[[0-9;]*mprint\x1b\[39m\(`, "u"),
  },
  {
    key: "javascript",
    plainLine: 'console.log("hello from js", value);',
    visibleWaitText: "console.log",
    ansiRegex: new RegExp(String.raw`(?:\x1b\[[0-9;]*m)+console`, "u"),
  },
  {
    key: "typescript",
    plainLine: "type Answer = {",
    visibleWaitText: "type Answer",
    ansiRegex: new RegExp(String.raw`(?:\x1b\[[0-9;]*m)+type`, "u"),
  },
  {
    key: "bash",
    plainLine: 'echo "hello from sh"',
    visibleWaitText: "echo",
    ansiRegex: new RegExp(String.raw`(?:\x1b\[[0-9;]*m)+echo(?:\x1b\[[0-9;]*m)+`, "u"),
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
  const observerCapturePath = path.join(tmpDir, "observer.capture");
  const observerWriteLogPath = path.join(tmpDir, "observer.write.log");
  const observerTranscriptPath = path.join(tmpDir, "observer.typescript");
  const targetWriteLogPath = path.join(tmpDir, "target.write.log");

  for (const artifactPath of [replayPath, observerTranscriptPath, targetWriteLogPath]) {
    assert(
      existsSync(artifactPath),
      `Expected proof artifact to exist: ${artifactPath}`,
    );
  }

  const observerArtifactPath = existsSync(observerCapturePath)
    ? observerCapturePath
    : observerWriteLogPath;
  assert(
    existsSync(observerArtifactPath),
    `Expected observer proof artifact to exist: ${observerArtifactPath}`,
  );

  const replayAnsi = readFileSync(replayPath, "utf8");
  const observerArtifact = readFileSync(observerArtifactPath, "utf8");
  const targetWriteLog = readFileSync(targetWriteLogPath, "utf8");

  assert(
    stripAnsi(replayAnsi).includes(scenario.visibleWaitText),
    `Expected replay artifact to contain ${scenario.key} proof text: ${scenario.visibleWaitText}`,
  );
  assert(
    stripAnsi(observerArtifact).includes(scenario.visibleWaitText),
    `Expected observer artifact to contain ${scenario.key} proof text: ${scenario.visibleWaitText}`,
  );
  assert(
    stripAnsi(targetWriteLog).includes(scenario.visibleWaitText),
    `Expected target write log to contain ${scenario.key} proof text: ${scenario.visibleWaitText}`,
  );
  assert(
    scenario.ansiRegex.test(replayAnsi),
    `Expected replay artifact to preserve ANSI-highlighted ${scenario.key} proof content.`,
  );
  assert(
    scenario.ansiRegex.test(observerArtifact),
    `Expected observer artifact to preserve ANSI-highlighted ${scenario.key} proof content.`,
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
