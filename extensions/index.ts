import {
  createBashToolDefinition,
  type BashToolDetails,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
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
  "pi-inline-format: TypeScript now wraps the Rust CLI for transcript analysis and render blocks.";
const STATUS_DESCRIPTION =
  "Show the current pi-inline-format wrapper status and Rust CLI integration state.";
const ANALYZE_DESCRIPTION =
  "Analyze a transcript via the Rust CLI. Omits arguments to analyze the built-in heredoc sample.";
const RENDER_DESCRIPTION =
  "Render a transcript into distinct language-aware markdown code blocks via the Rust CLI. Omits arguments to render the built-in heredoc sample.";
const ANALYZE_PARAMS = Type.Object({
  transcript: Type.String({
    description: "Raw transcript text to send to the Rust CLI over stdin.",
  }),
});
const INLINE_RENDER_PREVIEW_LINES = 8;
const originalBashTool = createBashToolDefinition(process.cwd());

type InlineFormatBashToolDetails = BashToolDetails & {
  inlineFormat?: {
    invocation: string;
    renderBlocks: RenderBlock[];
  };
};

type BashToolInput = Parameters<typeof originalBashTool.execute>[1];
type BashToolSignal = Parameters<typeof originalBashTool.execute>[2];
type BashToolOnUpdate = Parameters<typeof originalBashTool.execute>[3];
type BashToolExecuteContext = Parameters<typeof originalBashTool.execute>[4];
type BashToolResult = Awaited<ReturnType<typeof originalBashTool.execute>>;
type BashRenderCallArgs = Parameters<
  NonNullable<typeof originalBashTool.renderCall>
>[0];
type BashRenderCallTheme = Parameters<
  NonNullable<typeof originalBashTool.renderCall>
>[1];
type BashRenderCallContext = Parameters<
  NonNullable<typeof originalBashTool.renderCall>
>[2];
type BashRenderCallComponent = ReturnType<
  NonNullable<typeof originalBashTool.renderCall>
>;
type BashRenderResultValue = Parameters<
  NonNullable<typeof originalBashTool.renderResult>
>[0];
type BashRenderResultOptions = Parameters<
  NonNullable<typeof originalBashTool.renderResult>
>[1];
type BashRenderResultTheme = Parameters<
  NonNullable<typeof originalBashTool.renderResult>
>[2];
type BashRenderResultContext = Parameters<
  NonNullable<typeof originalBashTool.renderResult>
>[3];
type BashRenderResultComponent = ReturnType<
  NonNullable<typeof originalBashTool.renderResult>
>;
type BashUpdatePayload = Parameters<NonNullable<BashToolOnUpdate>>[0];

/** Register the project-local Pi extension wrapper. */
export default function registerInlineFormatExtension(pi: ExtensionAPI): void {
  pi.registerCommand(STATUS_COMMAND, {
    description: STATUS_DESCRIPTION,
    handler: async (_args, ctx) => {
      await Promise.resolve();
      ctx.ui.notify(STATUS_MESSAGE, "info");
    },
  });

  const bashToolDefinition: typeof originalBashTool = {
    name: originalBashTool.name,
    label: originalBashTool.label,
    description: originalBashTool.description,
    ...(originalBashTool.promptSnippet
      ? { promptSnippet: originalBashTool.promptSnippet }
      : {}),
    ...(originalBashTool.promptGuidelines
      ? { promptGuidelines: originalBashTool.promptGuidelines }
      : {}),
    parameters: originalBashTool.parameters,
    async execute(
      toolCallId: string,
      params: BashToolInput,
      signal: BashToolSignal,
      onUpdate: BashToolOnUpdate,
      ctx: BashToolExecuteContext,
    ): Promise<BashToolResult> {
      const inlineFormat = await analyzeInlineRenderableCommand(params.command);
      const wrappedOnUpdate: BashToolOnUpdate =
        onUpdate === undefined
          ? undefined
          : (update: BashUpdatePayload): void => {
              onUpdate({
                ...update,
                details: mergeInlineFormatDetails(update.details, inlineFormat),
              });
            };
      const result = await originalBashTool.execute(
        toolCallId,
        params,
        signal,
        wrappedOnUpdate,
        ctx,
      );

      return {
        ...result,
        details: mergeInlineFormatDetails(result.details, inlineFormat),
      };
    },
    renderCall(
      args: BashRenderCallArgs,
      theme: BashRenderCallTheme,
      context: BashRenderCallContext,
    ): BashRenderCallComponent {
      return (
        originalBashTool.renderCall?.(args, theme, context) ??
        new Text(args.command, 0, 0)
      );
    },
    renderResult(
      result: BashRenderResultValue,
      options: BashRenderResultOptions,
      theme: BashRenderResultTheme,
      context: BashRenderResultContext,
    ): BashRenderResultComponent {
      const fallback = (): BashRenderResultComponent =>
        originalBashTool.renderResult?.(result, options, theme, context) ??
        new Text(renderToolResultText(result), 0, 0);

      if (options.isPartial || context.isError) {
        return fallback();
      }

      const details = result.details as InlineFormatBashToolDetails | undefined;
      const inlineFormat = details?.inlineFormat;
      if (!inlineFormat || !hasEmbeddedRenderBlocks(inlineFormat.renderBlocks)) {
        return fallback();
      }

      return new Text(
        renderInlineBashResult(
          inlineFormat.renderBlocks,
          renderToolResultText(result),
          options.expanded,
          theme,
        ),
        0,
        0,
      );
    },
  };

  pi.registerTool(bashToolDefinition);

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

function renderInlineBashResult(
  renderBlocks: RenderBlock[],
  output: string,
  expanded: boolean,
  theme: BashRenderResultTheme,
): string {
  const previewBlocks = expanded
    ? renderBlocks
    : truncateRenderBlocks(renderBlocks, INLINE_RENDER_PREVIEW_LINES);
  const hiddenBlockCount = renderBlocks.length - previewBlocks.length;
  const lines = [
    theme.fg("success", "Inline transcript rendering"),
    theme.fg("dim", "bash wrapper and embedded code were rendered as separate blocks."),
  ];

  for (const block of previewBlocks) {
    lines.push("");
    lines.push(renderInlineBlockHeading(block, theme));
    lines.push(...renderInlineBlockContent(block, theme));
  }

  if (!expanded && hiddenBlockCount > 0) {
    lines.push("");
    lines.push(
      theme.fg(
        "dim",
        `… ${String(hiddenBlockCount)} more block(s) hidden; expand for full output.`,
      ),
    );
  }

  lines.push("");
  lines.push(theme.fg("toolTitle", theme.bold("Command output")));
  lines.push(theme.fg("toolOutput", output));

  return lines.join("\n");
}

function renderInlineBlockHeading(
  block: RenderBlock,
  theme: BashRenderResultTheme,
): string {
  const color = block.role === "embedded" ? "accent" : "warning";
  const label = block.role === "embedded" ? "embedded code" : "bash wrapper";
  return theme.fg(color, theme.bold(`${label} · ${block.language}`));
}

function renderInlineBlockContent(
  block: RenderBlock,
  theme: BashRenderResultTheme,
): string[] {
  const color = block.role === "embedded" ? "success" : "toolOutput";
  const lines = block.content.replace(/\n$/, "").split("\n");
  return lines.map((line) => theme.fg(color, line.length > 0 ? line : " "));
}

function truncateRenderBlocks(
  renderBlocks: RenderBlock[],
  maxLines: number,
): RenderBlock[] {
  let remaining = maxLines;
  const truncated: RenderBlock[] = [];

  for (const block of renderBlocks) {
    if (remaining <= 0) {
      break;
    }

    const rawLines = block.content.split("\n");
    const visibleLines =
      rawLines[rawLines.length - 1] === "" ? rawLines.length - 1 : rawLines.length;
    const lineBudget = Math.min(remaining, Math.max(visibleLines, 1));
    const keptLines = rawLines.slice(0, lineBudget).join("\n");

    truncated.push({
      ...block,
      content: keptLines.endsWith("\n") ? keptLines : `${keptLines}\n`,
    });
    remaining -= lineBudget;
  }

  return truncated;
}

function renderToolResultText(result: { content: BashToolResult["content"] }): string {
  const textContent = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  return textContent || "(no output)";
}

async function analyzeInlineRenderableCommand(
  command: string,
): Promise<InlineFormatBashToolDetails["inlineFormat"] | undefined> {
  try {
    const analysisResult = await analyzeTranscriptWithRustCli(command);
    if (!hasEmbeddedRenderBlocks(analysisResult.analysis.render_blocks)) {
      return undefined;
    }

    return {
      invocation: analysisResult.invocation.display,
      renderBlocks: analysisResult.analysis.render_blocks,
    };
  } catch {
    return undefined;
  }
}

function hasEmbeddedRenderBlocks(renderBlocks: RenderBlock[]): boolean {
  return renderBlocks.some((block) => block.role === "embedded");
}

function mergeInlineFormatDetails(
  details: BashToolDetails | undefined,
  inlineFormat: InlineFormatBashToolDetails["inlineFormat"] | undefined,
): InlineFormatBashToolDetails | undefined {
  if (!details && !inlineFormat) {
    return undefined;
  }

  if (!inlineFormat) {
    return details;
  }

  return {
    ...(details ?? {}),
    inlineFormat,
  };
}

export function renderAnalysisAsMarkdown(analysis: AnalyzeResponse): string {
  return renderBlocksAsMarkdown(analysis.render_blocks);
}
