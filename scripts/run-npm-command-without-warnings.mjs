import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

if (args.length === 0) {
  throw new Error(
    "Usage: node ./scripts/run-npm-command-without-warnings.mjs <npm-args...>",
  );
}

const result = spawnSync("npm", args, {
  cwd: process.cwd(),
  encoding: "utf8",
  env: process.env,
});

if (result.stdout.length > 0) {
  process.stdout.write(result.stdout);
}

if (result.stderr.length > 0) {
  process.stderr.write(result.stderr);
}

if (result.error) {
  throw result.error;
}

const warningLines = `${result.stdout}\n${result.stderr}`
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => /^npm warn\b/iu.test(line));

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (warningLines.length > 0) {
  throw new Error(
    [
      `npm ${args.join(" ")} emitted warnings that are blocked in this repository:`,
      ...warningLines.map((line) => `- ${line}`),
    ].join("\n"),
  );
}
