import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type ToolCall,
} from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

export const INLINE_DETERMINISTIC_PROVIDER = "inline-deterministic";
export const INLINE_DETERMINISTIC_MODEL = "canonical-heredoc-compare";
export const INLINE_DETERMINISTIC_PROMPT =
  "Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py";
export const INLINE_DETERMINISTIC_USE_COMMAND = "inline-format-use-deterministic-model";
export const INLINE_DETERMINISTIC_RUN_COMMAND =
  "inline-format-run-deterministic-compare";
export const INLINE_DETERMINISTIC_STATUS_COMMAND = "inline-format-deterministic-status";

const INLINE_DETERMINISTIC_API = "inline-deterministic-api";
const INLINE_DETERMINISTIC_TOOL_CALL_ID = "call_inline_format_deterministic_bash";
const INLINE_DETERMINISTIC_BASH_COMMAND = `cat > /tmp/delete.me.py <<'PY'
#!/usr/bin/env python3

def main() -> None:
    print("hello from /tmp/delete.me.py")

if __name__ == "__main__":
    main()
PY`;
const INLINE_DETERMINISTIC_MISS_MESSAGE =
  "This deterministic compare model only supports the canonical heredoc flow. Use /inline-format-run-deterministic-compare.";

function createUsage(): AssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function createAssistantShell(model: Model<string>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: createUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function getLatestUserText(context: Context): string | undefined {
  const latestUser = [...context.messages]
    .reverse()
    .find((message) => message.role === "user");

  if (latestUser === undefined) {
    return undefined;
  }

  if (typeof latestUser.content === "string") {
    return latestUser.content;
  }

  return latestUser.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n")
    .trim();
}

function hasSuccessfulToolResult(
  context: Context,
  toolName: string,
  toolCallId: string,
): boolean {
  return context.messages.some(
    (message) =>
      message.role === "toolResult" &&
      message.toolName === toolName &&
      message.toolCallId === toolCallId &&
      !message.isError,
  );
}

function pushTextResponse(
  stream: AssistantMessageEventStream,
  output: AssistantMessage,
  text: string,
): void {
  output.content.push({ type: "text", text: "" });
  const contentIndex = output.content.length - 1;
  stream.push({ type: "text_start", contentIndex, partial: output });

  const block = output.content[contentIndex];
  if (block?.type === "text") {
    block.text = text;
  }

  stream.push({ type: "text_delta", contentIndex, delta: text, partial: output });
  stream.push({ type: "text_end", contentIndex, content: text, partial: output });
  stream.push({ type: "done", reason: "stop", message: output });
  stream.end();
}

function pushToolCallResponse(
  stream: AssistantMessageEventStream,
  output: AssistantMessage,
  toolCall: ToolCall,
): void {
  output.stopReason = "toolUse";
  output.content.push(toolCall);
  const contentIndex = output.content.length - 1;
  stream.push({ type: "toolcall_start", contentIndex, partial: output });
  stream.push({
    type: "toolcall_delta",
    contentIndex,
    delta: JSON.stringify(toolCall.arguments),
    partial: output,
  });
  stream.push({ type: "toolcall_end", contentIndex, toolCall, partial: output });
  stream.push({ type: "done", reason: "toolUse", message: output });
  stream.end();
}

function streamDeterministicInlineCompare(
  model: Model<string>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  queueMicrotask(() => {
    const output = createAssistantShell(model);
    stream.push({ type: "start", partial: output });

    try {
      if (options?.signal?.aborted) {
        output.stopReason = "aborted";
        output.errorMessage = "Aborted before deterministic compare response.";
        stream.push({ type: "error", reason: "aborted", error: output });
        stream.end();
        return;
      }

      if (hasSuccessfulToolResult(context, "bash", INLINE_DETERMINISTIC_TOOL_CALL_ID)) {
        stream.push({ type: "done", reason: "stop", message: output });
        stream.end();
        return;
      }

      if (getLatestUserText(context) !== INLINE_DETERMINISTIC_PROMPT) {
        pushTextResponse(stream, output, INLINE_DETERMINISTIC_MISS_MESSAGE);
        return;
      }

      pushToolCallResponse(stream, output, {
        type: "toolCall",
        id: INLINE_DETERMINISTIC_TOOL_CALL_ID,
        name: "bash",
        arguments: {
          command: INLINE_DETERMINISTIC_BASH_COMMAND,
        },
      });
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  });

  return stream;
}

async function useDeterministicModel(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const model = ctx.modelRegistry.find(
    INLINE_DETERMINISTIC_PROVIDER,
    INLINE_DETERMINISTIC_MODEL,
  );
  if (model === undefined) {
    ctx.ui.notify(
      `Model ${INLINE_DETERMINISTIC_PROVIDER}/${INLINE_DETERMINISTIC_MODEL} is not registered. Try /reload.`,
      "error",
    );
    return;
  }

  const success = await pi.setModel(model);
  if (!success) {
    ctx.ui.notify(
      `Could not activate ${INLINE_DETERMINISTIC_PROVIDER}/${INLINE_DETERMINISTIC_MODEL}.`,
      "error",
    );
    return;
  }

  ctx.ui.notify(
    `Using ${INLINE_DETERMINISTIC_PROVIDER}/${INLINE_DETERMINISTIC_MODEL} for deterministic compare output.`,
    "info",
  );
}

export function registerDeterministicProvider(pi: ExtensionAPI): void {
  pi.registerProvider(INLINE_DETERMINISTIC_PROVIDER, {
    baseUrl: "https://inline-deterministic.invalid",
    apiKey: "inline-deterministic-local-only",
    api: INLINE_DETERMINISTIC_API,
    models: [
      {
        id: INLINE_DETERMINISTIC_MODEL,
        name: "Canonical Heredoc Compare",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32000,
        maxTokens: 4096,
      },
    ],
    streamSimple: streamDeterministicInlineCompare,
  });

  pi.registerCommand(INLINE_DETERMINISTIC_USE_COMMAND, {
    description: `Switch the current session to ${INLINE_DETERMINISTIC_PROVIDER}/${INLINE_DETERMINISTIC_MODEL}.`,
    handler: async (_args, ctx) => {
      await useDeterministicModel(pi, ctx);
    },
  });

  pi.registerCommand(INLINE_DETERMINISTIC_RUN_COMMAND, {
    description:
      "Switch to the local deterministic compare model and send the canonical heredoc prompt with no real LLM call.",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "Agent is busy. Wait for it to finish before starting the deterministic compare.",
          "warning",
        );
        return;
      }

      await useDeterministicModel(pi, ctx);
      pi.sendUserMessage(INLINE_DETERMINISTIC_PROMPT);
    },
  });

  pi.registerCommand(INLINE_DETERMINISTIC_STATUS_COMMAND, {
    description:
      "Show the local deterministic compare provider, model, and helper commands.",
    handler: async (_args, ctx) => {
      await Promise.resolve();
      ctx.ui.notify(
        [
          `Provider: ${INLINE_DETERMINISTIC_PROVIDER}`,
          `Model: ${INLINE_DETERMINISTIC_MODEL}`,
          `Prompt: ${INLINE_DETERMINISTIC_PROMPT}`,
          `Commands: /${INLINE_DETERMINISTIC_USE_COMMAND}, /${INLINE_DETERMINISTIC_RUN_COMMAND}`,
        ].join("\n"),
        "info",
      );
    },
  });
}
