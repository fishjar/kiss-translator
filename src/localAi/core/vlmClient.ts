import { LlmClient } from "./llmClient";
import { runtimeHost, type RuntimeHostAdapter } from "../runtime/runtimeHostAdapter";

export class VlmClient extends LlmClient {
  constructor(host: RuntimeHostAdapter = runtimeHost) { super(host, "vlm"); }
}
