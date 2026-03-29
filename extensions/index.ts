import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import {
  type AnalyzeResponse,
  type RenderBlock,
  analyzeTranscriptWithRustCli,
} from "./rust-cli.js";

const STATUS_COMMAND = "inline-format-status";
const ANALYZE_COMMAND = "inline-format-analyze";
const RENDER_COMMAND = "inline-format-render";
const ANALYZE_TOOL = "analyze_inline_transcript";
const RENDER_TOOL = "render_inline_transcript";
const SAMPLE_TRANSCRIPT = "$ python - <<'PY'\nprint('hi')\nPY\n$ echo done\n";
const STATUS_MESSAGE =
  "pi-inline-format: project-local extension now exposes Rust CLI transcript diagnostics while runtime seams load from the package-backed host via .pi/settings.json.";
const STATUS_DESCRIPTION =
  "Show the current project-local Rust CLI diagnostics status for pi-inline-format.";
const ANALYZE_DESCRIPTION =
  "Analyze a transcript via the Rust CLI. Omits arguments to analyze the built-in heredoc sample.";
const RENDER_DESCRIPTION =
  "Render a transcript into distinct language-aware markdown code blocks via the Rust CLI. Omits arguments to render the built-in heredoc sample.";
const ANALYZE_PARAMS = Type.Object({
  transcript: Type.String({
    description: "Raw transcript text to send to the Rust CLI over stdin.",
  }),
});

/** Register the project-local Rust diagnostics extension. */
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
        `Analyzed ${sourceLabel} via ${analysisResult.invocation.display}: ${summary}; render blocks=${String(analysisResult.analysis.render_blocks.length)}`,
        "info",
      );
    },
  });

  pi.registerCommand(RENDER_COMMAND, {
    description: RENDER_DESCRIPTION,
    handler: async (args, ctx) => {
      const trimmedArgs = args.trim();
      const transcript = trimmedArgs || SAMPLE_TRANSCRIPT;
      const analysisResult = await analyzeTranscriptWithRustCli(transcript);
      const sourceLabel = trimmedArgs
        ? "provided transcript"
        : "built-in sample transcript";
      const markdown = renderBlocksAsMarkdown(analysisResult.analysis.render_blocks);

      ctx.ui.notify(
        `Rendered ${sourceLabel} via ${analysisResult.invocation.display}:\n${markdown}`,
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
          renderBlockCount: analysisResult.analysis.render_blocks.length,
          regions: analysisResult.analysis.regions,
          renderBlocks: analysisResult.analysis.render_blocks,
        },
      };
    },
  });

  pi.registerTool({
    name: RENDER_TOOL,
    label: "Render Inline Transcript",
    description:
      "Send transcript text to the Rust CLI and return distinct language-aware markdown code blocks plus structured render blocks.",
    promptSnippet:
      "Render transcript text via the Rust CLI so embedded code stays separate from the surrounding shell wrapper.",
    promptGuidelines: [
      "Use this tool when readable transcript rendering is needed.",
      "Prefer the returned markdown or renderBlocks instead of rebuilding wrapper/code boundaries in TypeScript.",
    ],
    parameters: ANALYZE_PARAMS,
    async execute(_toolCallId, params) {
      const analysisResult = await analyzeTranscriptWithRustCli(params.transcript);
      const markdown = renderBlocksAsMarkdown(analysisResult.analysis.render_blocks);

      return {
        content: [
          {
            type: "text",
            text: markdown,
          },
        ],
        details: {
          invocation: analysisResult.invocation.display,
          invocationSource: analysisResult.invocation.source,
          analysis: analysisResult.analysis,
          renderBlocks: analysisResult.analysis.render_blocks,
        },
      };
    },
  });
}

function renderBlocksAsMarkdown(renderBlocks: RenderBlock[]): string {
  return renderBlocks.map((block) => renderBlockAsMarkdown(block)).join("\n\n");
}

function renderBlockAsMarkdown(block: RenderBlock): string {
  const heading = `<!-- ${block.role}:${block.id} -->`;
  return `${heading}\n\
\`\`\`${block.language}\n${block.content}\`\`\``;
}

export function renderAnalysisAsMarkdown(analysis: AnalyzeResponse): string {
  return renderBlocksAsMarkdown(analysis.render_blocks);
}
