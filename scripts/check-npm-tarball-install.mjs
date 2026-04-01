import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKAGE_NAME = "@banon-labs/pi-inline-format";
const EXTENSIONS_PACKAGE_NAME = "@banon-labs/pi-inline-format-extensions";
const JAVASCRIPT_PROMPT =
  "Use bash to run javascript from a heredoc with node. Use JS as the heredoc delimiter exactly. Keep the transcript inline and normal.";

const repoRoot = process.cwd();
const extensionsRepoRoot = path.resolve(repoRoot, "..", "pi-inline-format-extensions");
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "pi-inline-format-npm-pack-"));
const tarballDir = path.join(tempRoot, "tarballs");
const projectRoot = path.join(tempRoot, "project");
const settingsDir = path.join(projectRoot, ".pi");
const settingsPath = path.join(settingsDir, "settings.json");

mkdirSync(tarballDir, { recursive: true });
mkdirSync(projectRoot, { recursive: true });
mkdirSync(settingsDir, { recursive: true });

try {
  const packageTarball = packPackage(repoRoot, tarballDir);
  const extensionsTarball = packPackage(extensionsRepoRoot, tarballDir);

  installTarballs(projectRoot, [packageTarball, extensionsTarball]);

  const installedPackagePath = path.join(
    projectRoot,
    "node_modules",
    ...PACKAGE_NAME.split("/"),
  );
  const installedExtensionsPath = path.join(
    projectRoot,
    "node_modules",
    ...EXTENSIONS_PACKAGE_NAME.split("/"),
  );

  for (const packagePath of [installedPackagePath, installedExtensionsPath]) {
    assert(existsSync(packagePath), `Expected installed package path: ${packagePath}`);
  }

  assert(
    existsSync(path.join(installedPackagePath, "extensions", "index.ts")),
    "Expected npm-installed pi-inline-format tarball to include extensions/index.ts.",
  );
  assert(
    existsSync(path.join(installedPackagePath, "rust", "Cargo.toml")),
    "Expected npm-installed pi-inline-format tarball to include rust/Cargo.toml.",
  );
  assert(
    existsSync(
      path.join(installedExtensionsPath, "packages", "host", "extensions", "index.ts"),
    ),
    "Expected npm-installed extensions tarball to include host extension entrypoint.",
  );

  writeFileSync(
    settingsPath,
    `${JSON.stringify(
      {
        packages: [
          {
            source: installedPackagePath,
            skills: [],
            prompts: [],
            themes: [],
          },
          {
            source: installedExtensionsPath,
            skills: [],
            prompts: [],
            themes: [],
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const listResult = runPi(projectRoot, ["list"]);
  for (const packagePath of [installedPackagePath, installedExtensionsPath]) {
    assert(
      listResult.stdout.includes(packagePath),
      [
        `Expected pi list to report installed package source ${packagePath}.`,
        "--- stdout ---",
        listResult.stdout.trim(),
      ].join("\n"),
    );
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log(
  [
    "NPM tarball install smoke passed.",
    `packages=${PACKAGE_NAME},${EXTENSIONS_PACKAGE_NAME}`,
    `prompt=${JAVASCRIPT_PROMPT}`,
  ].join(" "),
);

function packPackage(cwd, outputDir) {
  const result = run("npm", ["pack", "--json", "--pack-destination", outputDir], cwd);
  const entries = JSON.parse(result.stdout);
  assert(
    Array.isArray(entries) && entries.length > 0,
    "Expected npm pack JSON output.",
  );
  const filename = entries[0]?.filename;
  assert.equal(typeof filename, "string", "Expected npm pack to return a filename.");
  return path.join(outputDir, filename);
}

function installTarballs(cwd, tarballPaths) {
  writeFileSync(
    path.join(cwd, "package.json"),
    `${JSON.stringify({ name: "tmp-install-check", private: true }, null, 2)}\n`,
    "utf8",
  );
  run("npm", ["install", "--legacy-peer-deps", ...tarballPaths], cwd);
}

function runPi(cwd, args) {
  const command = process.platform === "win32" ? "pi.cmd" : "pi";
  return run(command, args, cwd);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  const warningLines =
    command !== "npm"
      ? []
      : `${result.stdout}\n${result.stderr}`
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => /^npm warn\b/iu.test(line));

  if (result.status !== 0 || warningLines.length > 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} ${result.status !== 0 ? `exited with status ${String(result.status)}.` : "emitted blocked npm warnings."}`,
        ...(warningLines.length === 0 ? [] : ["--- npm warnings ---", ...warningLines]),
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
