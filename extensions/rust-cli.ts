import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export type RegionRole = "outer" | "embedded";

export type TranscriptRegion = {
  id: string;
  role: RegionRole;
  language: string;
  start_byte: number;
  end_byte: number;
};

export type RenderBlock = {
  id: string;
  role: RegionRole;
  language: string;
  content: string;
};

export type AnalyzeResponse = {
  regions: TranscriptRegion[];
  render_blocks: RenderBlock[];
};

type RustCliInvocation = {
  command: string;
  args: string[];
  display: string;
  source: "binary" | "cargo";
};

export type RustCliAnalysisResult = {
  invocation: RustCliInvocation;
  analysis: AnalyzeResponse;
};

const REPO_ROOT = join(import.meta.dirname, "..");
const RUST_DIR = join(REPO_ROOT, "rust");
const RUST_SRC_DIR = join(RUST_DIR, "src");
const RUST_MANIFEST_PATH = join(RUST_DIR, "Cargo.toml");
const CORE_BINARY_NAME =
  process.platform === "win32" ? "pi-inline-format-core.exe" : "pi-inline-format-core";
const CORE_BINARY_CANDIDATES = [
  join(RUST_DIR, "target", "release", CORE_BINARY_NAME),
  join(RUST_DIR, "target", "debug", CORE_BINARY_NAME),
] as const;

export async function analyzeTranscriptWithRustCli(
  transcript: string,
): Promise<RustCliAnalysisResult> {
  const invocation = await resolveRustCliInvocation();
  const stdout = await runRustCli(invocation, transcript);

  return {
    invocation,
    analysis: parseAnalyzeResponse(stdout),
  };
}

async function resolveRustCliInvocation(): Promise<RustCliInvocation> {
  const latestSourceTimestamp = await getLatestRustSourceTimestamp();

  for (const candidate of CORE_BINARY_CANDIDATES) {
    if (await isFreshBinary(candidate, latestSourceTimestamp)) {
      return {
        command: candidate,
        args: [],
        display: candidate,
        source: "binary",
      };
    }
  }

  return {
    command: "cargo",
    args: [
      "run",
      "--manifest-path",
      RUST_MANIFEST_PATH,
      "--quiet",
      "--bin",
      "pi-inline-format-core",
    ],
    display: `cargo run --manifest-path ${RUST_MANIFEST_PATH} --quiet --bin pi-inline-format-core`,
    source: "cargo",
  };
}

async function getLatestRustSourceTimestamp(): Promise<number> {
  const sourceFiles = await collectRustSourceFiles(RUST_SRC_DIR);
  const timestamps = await Promise.all(
    [RUST_MANIFEST_PATH, ...sourceFiles].map(async (path) => {
      const fileStats = await stat(path);
      return fileStats.mtimeMs;
    }),
  );

  return Math.max(...timestamps);
}

async function collectRustSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return await collectRustSourceFiles(entryPath);
      }

      return entry.name.endsWith(".rs") ? [entryPath] : [];
    }),
  );

  return files.flat();
}

async function isFreshBinary(
  path: string,
  latestSourceTimestamp: number,
): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    const binaryStats = await stat(path);
    return binaryStats.mtimeMs >= latestSourceTimestamp;
  } catch {
    return false;
  }
}

async function runRustCli(
  invocation: RustCliInvocation,
  transcript: string,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: REPO_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.on("error", (error) => {
      reject(
        new Error(
          `Failed to launch Rust CLI via ${invocation.display}: ${error.message}`,
          {
            cause: error,
          },
        ),
      );
    });
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.stdin.end(transcript);
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (code !== 0) {
        const suffix = stderr ? `: ${stderr}` : "";
        const exitCode = code === null ? "null" : String(code);
        reject(
          new Error(
            `Rust CLI exited with code ${exitCode} via ${invocation.display}${suffix}`,
          ),
        );
        return;
      }

      if (!stdout) {
        reject(new Error(`Rust CLI produced no JSON output via ${invocation.display}`));
        return;
      }

      resolve(stdout);
    });
  });
}

function parseAnalyzeResponse(stdout: string): AnalyzeResponse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Rust CLI returned invalid JSON: ${message}`, { cause: error });
  }

  if (!isAnalyzeResponse(parsed)) {
    throw new Error("Rust CLI JSON did not match the expected AnalyzeResponse shape");
  }

  return parsed;
}

function isAnalyzeResponse(value: unknown): value is AnalyzeResponse {
  if (!isRecord(value)) {
    return false;
  }

  const regions = value["regions"];
  const renderBlocks = value["render_blocks"];

  return (
    Array.isArray(regions) &&
    regions.every((region) => isTranscriptRegion(region)) &&
    Array.isArray(renderBlocks) &&
    renderBlocks.every((block) => isRenderBlock(block))
  );
}

function isTranscriptRegion(value: unknown): value is TranscriptRegion {
  if (!isRecord(value)) {
    return false;
  }

  const id = value["id"];
  const role = value["role"];
  const language = value["language"];
  const startByte = value["start_byte"];
  const endByte = value["end_byte"];

  return (
    typeof id === "string" &&
    (role === "outer" || role === "embedded") &&
    typeof language === "string" &&
    Number.isInteger(startByte) &&
    Number.isInteger(endByte)
  );
}

function isRenderBlock(value: unknown): value is RenderBlock {
  if (!isRecord(value)) {
    return false;
  }

  const id = value["id"];
  const role = value["role"];
  const language = value["language"];
  const content = value["content"];

  return (
    typeof id === "string" &&
    (role === "outer" || role === "embedded") &&
    typeof language === "string" &&
    typeof content === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
