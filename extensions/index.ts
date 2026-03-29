import {
  createBashToolDefinition,
  highlightCode,
  initTheme,
  type ExtensionAPI,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { registerDeterministicProvider } from "./deterministic-provider-core.js";
import {
  type AnalyzeResponse,
  type RenderBlock,
  analyzeTranscriptWithRustCli,
} from "./rust-cli.js";

const BASH_PARAMS = Type.Object({
  command: Type.String({ description: "Bash command to execute" }),
  timeout: Type.Optional(
    Type.Number({ description: "Timeout in seconds (optional, no default timeout)" }),
  ),
});

const STATUS_COMMAND = "inline-format-status";
const ANALYZE_COMMAND = "inline-format-analyze";
const RENDER_COMMAND = "inline-format-render";
const ANALYZE_TOOL = "analyze_inline_transcript";
const RENDER_TOOL = "render_inline_transcript";
const SAMPLE_TRANSCRIPT = "$ python - <<'PY'\nprint('hi')\nPY\n$ echo done\n";
const STATUS_MESSAGE =
  "pi-inline-format: TypeScript now wraps the Rust CLI for transcript analysis and render blocks.";
const STATUS_DESCRIPTION =
  "Show the current pi-inline-format wrapper status and Rust CLI integration state.";
const ANALYZE_DESCRIPTION =
  "Analyze a transcript via the Rust CLI. Omits arguments to analyze the built-in heredoc sample.";
const RENDER_DESCRIPTION =
  "Render a transcript into distinct language-aware markdown code blocks via the Rust CLI. Omits arguments to render the built-in heredoc sample.";
const BASH_SUMMARY_SUPPRESSION_INSTRUCTIONS = `When the user asks for a bash action and the bash transcript itself will clearly show what happened, do not add prefatory narration, planning text, completion summaries, restatements, or reformatted file contents unless the user explicitly asks for them.

After a successful bash tool result, prefer ending the turn immediately with no extra assistant narration.

In particular, do not add follow-up narration such as:
- \`Done\`
- \`Done: <path>\`
- \`Created <path>\`
- \`Wrote <path>\`
- \`Executed <path>\`
- \`Contents:\`
- restated file paths
- fenced code blocks repeating file contents
- paraphrases like \`Created /tmp/delete.me.py with a bash heredoc.\`

For the canonical heredoc flow in this repo, the preferred behavior is:
- call bash directly
- let the bash tool row/output speak for itself
- do not add any assistant text before or after a successful bash tool result`;

const PYTHON_HEREDOC_MARKERS = ["<<'PY'", '<<"PY"', "<<PY"];

const PYTHON_HEREDOC_TERMINATOR = "PY";

const ANALYZE_PARAMS = Type.Object({
  transcript: Type.String({
    description: "Raw transcript text to send to the Rust CLI over stdin.",
  }),
});

function formatDefaultBashCall(
  command: string,
  timeout: number | undefined,
  theme: Pick<Theme, "fg" | "bold">,
): string {
  const timeoutSuffix = timeout
    ? theme.fg("muted", ` (timeout ${String(timeout)}s)`)
    : "";

  return `${theme.fg("toolTitle", theme.bold(`$ ${command}`))}${timeoutSuffix}`;
}

function highlightCodeWithRenderTheme(code: string, lang: string): string[] {
  initTheme();
  return highlightCode(code, lang);
}

function findPythonHeredocRange(lines: string[]): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  const startLineIndex = lines.findIndex((line) =>
    PYTHON_HEREDOC_MARKERS.some((marker) => line.includes(marker)),
  );

  if (startLineIndex === -1) {
    return null;
  }

  const endLineIndex = lines.findIndex(
    (line, index) => index > startLineIndex && line === PYTHON_HEREDOC_TERMINATOR,
  );

  if (endLineIndex <= startLineIndex + 1) {
    return null;
  }

  return { startLineIndex, endLineIndex };
}

function renderInlineHighlightedBashCall(
  command: string,
  timeout: number | undefined,
  theme: Pick<Theme, "fg" | "bold">,
): string | null {
  const lines = command.split("\n");
  const heredocRange = findPythonHeredocRange(lines);

  if (heredocRange === null) {
    return null;
  }

  const pythonSource = lines
    .slice(heredocRange.startLineIndex + 1, heredocRange.endLineIndex)
    .join("\n");

  if (pythonSource.length === 0) {
    return null;
  }

  const highlightedLines = highlightCodeWithRenderTheme(pythonSource, "python");
  const renderedLines = lines.map((line, index) => {
    const prefixedLine = `${index === 0 ? "$ " : ""}${line}`;

    if (index > heredocRange.startLineIndex && index < heredocRange.endLineIndex) {
      return `${index === 0 ? "$ " : ""}${highlightedLines[index - heredocRange.startLineIndex - 1] ?? line}`;
    }

    return theme.fg("toolTitle", theme.bold(prefixedLine));
  });

  const timeoutSuffix = timeout
    ? theme.fg("muted", ` (timeout ${String(timeout)}s)`)
    : "";

  return `${renderedLines.join("\n")}${timeoutSuffix}`;
}

/** Register the project-local Pi extension wrapper. */
export default function registerInlineFormatExtension(pi: ExtensionAPI): void {
  registerDeterministicProvider(pi);

  pi.on("before_agent_start", async (event) => {
    await Promise.resolve();
    if (event.systemPrompt.includes(BASH_SUMMARY_SUPPRESSION_INSTRUCTIONS)) {
      return undefined;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${BASH_SUMMARY_SUPPRESSION_INSTRUCTIONS}`,
    };
  });

  const originalBash = createBashToolDefinition(process.cwd());

  pi.registerTool({
    name: "bash",
    label: originalBash.label,
    description: originalBash.description,
    promptSnippet:
      originalBash.promptSnippet ?? "Execute bash commands (ls, grep, find, etc.)",
    parameters: BASH_PARAMS,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return await originalBash.execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderCall(args, theme, context) {
      const state = context.state as {
        startedAt?: number | undefined;
        endedAt?: number | undefined;
      };
      if (context.executionStarted && state.startedAt === undefined) {
        state.startedAt = Date.now();
        state.endedAt = undefined;
      }

      const highlightedCall = renderInlineHighlightedBashCall(
        args.command,
        args.timeout,
        theme,
      );

      if (args.command.includes("/tmp/delete.me.py") && highlightedCall !== null) {
        return new Text(highlightedCall, 0, 0);
      }

      const renderedCall =
        highlightedCall ?? formatDefaultBashCall(args.command, args.timeout, theme);
      return new Text(renderedCall, 0, 0);
    },
  });

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
