import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerDeterministicProvider } from "./deterministic-provider-core.js";

export default function registerDeterministicProviderExtension(pi: ExtensionAPI): void {
  registerDeterministicProvider(pi);
}
