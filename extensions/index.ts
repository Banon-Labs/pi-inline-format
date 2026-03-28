import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { analyzeTranscriptWithRustCli } from "./rust-cli.js";

const STATUS_COMMAND = "inline-format-status";
const ANALYZE_COMMAND = "inline-format-analyze";
const ANALYZE_TOOL = "analyze_inline_transcript";
const SAMPLE_TRANSCRIPT = "$ python - <<'PY'\nprint('hi')\nPY\n$ echo done\n";
const STATUS_MESSAGE =
  "pi-inline-format: TypeScript now wraps the Rust CLI for transcript analysis.";
const STATUS_DESCRIPTION =
  "Show the current pi-inline-format wrapper status and Rust CLI integration state.";
const ANALYZE_DESCRIPTION =
  "Analyze a transcript via the Rust CLI. Omits arguments to analyze the built-in heredoc sample.";
const ANALYZE_PARAMS = Type.Object({
  transcript: Type.String({
    description: "Raw transcript text to send to the Rust CLI over stdin.",
  }),
});

/** Register the project-local Pi extension wrapper. */
export default function registerInlineFormatExtension(pi: ExtensionAPI): void {
  pi.registerCommand(STATUS_COMMAND, {
    description: STATUS_DESCRIPTION,
    handler: async (_args, ctx) => {
      await Promise.resolve();
      ctx.ui.notify(STATUS_MESSAGE, "info");
    },
  });

  pi.registerCommand(ANALYZE_COMMAND, {
    description: ANALYZE_DESCRIPTION,
    handler: async (args, ctx) => {
      const trimmedArgs = args.trim();
      const transcript = trimmedArgs || SAMPLE_TRANSCRIPT;
      const analysisResult = await analyzeTranscriptWithRustCli(transcript);
      const summary = analysisResult.analysis.regions
        .map(
          (region) =>
            `${region.role}:${region.language}[${String(region.start_byte)}-${String(region.end_byte)}]`,
        )
        .join(", ");
      const sourceLabel = trimmedArgs
        ? "provided transcript"
        : "built-in sample transcript";

      ctx.ui.notify(
        `Analyzed ${sourceLabel} via ${analysisResult.invocation.display}: ${summary}`,
        "info",
      );
    },
  });

  pi.registerTool({
    name: ANALYZE_TOOL,
    label: "Analyze Inline Transcript",
    description:
      "Send transcript text to the Rust CLI and return the structured JSON analysis contract.",
    promptSnippet:
      "Analyze transcript text with the Rust CLI instead of reimplementing parsing in TypeScript.",
    promptGuidelines: [
      "Use this tool when transcript region detection is needed.",
      "Pass the raw transcript text without trying to parse it in TypeScript first.",
    ],
    parameters: ANALYZE_PARAMS,
    async execute(_toolCallId, params) {
      const analysisResult = await analyzeTranscriptWithRustCli(params.transcript);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(analysisResult.analysis, null, 2),
          },
        ],
        details: {
          invocation: analysisResult.invocation.display,
          invocationSource: analysisResult.invocation.source,
          regionCount: analysisResult.analysis.regions.length,
          regions: analysisResult.analysis.regions,
        },
      };
    },
  });
}
