import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const STATUS_COMMAND = "inline-format-status";
const STATUS_MESSAGE =
  "pi-inline-format: TypeScript wrapper scaffolded, Rust core scaffolded, integration pending.";
const STATUS_DESCRIPTION =
  "Show the current pi-inline-format scaffold status for the TypeScript wrapper and Rust core.";

/** Register the project-local Pi extension wrapper. */
export default function registerInlineFormatExtension(pi: ExtensionAPI): void {
  pi.registerCommand(STATUS_COMMAND, {
    description: STATUS_DESCRIPTION,
    handler: async (_args, ctx) => {
      await Promise.resolve();
      ctx.ui.notify(STATUS_MESSAGE, "info");
    },
  });
}
