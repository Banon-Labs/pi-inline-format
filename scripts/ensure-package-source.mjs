import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function ensurePackageSourceMaterialized(repoRoot, source) {
  if (source.startsWith("git:")) {
    ensureGitPackageSourceMaterialized(repoRoot, source);
    return;
  }

  const resolvedPath = path.resolve(repoRoot, ".pi", source);
  assert(
    existsSync(resolvedPath),
    `Expected local package source path to exist: ${resolvedPath}`,
  );
}

function ensureGitPackageSourceMaterialized(repoRoot, source) {
  const match = /^git:(?<slug>github\.com\/[^@]+)@(?<ref>.+)$/u.exec(source);
  assert(match?.groups, `Unsupported git package source format: ${source}`);

  const slug = match.groups.slug;
  const ref = match.groups.ref;
  const cloneDir = path.join(repoRoot, ".pi", "git", slug);
  const remoteUrl = `https://${slug}.git`;

  mkdirSync(path.dirname(cloneDir), { recursive: true });

  if (!existsSync(path.join(cloneDir, ".git"))) {
    run("git", ["clone", remoteUrl, cloneDir], repoRoot);
  }

  run("git", ["-C", cloneDir, "fetch", "origin", ref], repoRoot);
  run("git", ["-C", cloneDir, "checkout", "--force", ref], repoRoot);

  if (!existsSync(path.join(cloneDir, "node_modules", ".package-lock.json"))) {
    run("npm", ["ci", "--prefix", cloneDir], repoRoot);
  }
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
}
