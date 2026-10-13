import { runtimeHost } from "../runtime/runtimeHostAdapter";
import { nextRpcId } from "../runtime/rpc";
import type { Settings } from "./types";
import { checkFileSize } from "./inputLimits";

// File entrypoints check before reading bytes or allowing a preview to decode.
export async function validateInputFile(file: Blob, kind: "image" | "audio", signal?: AbortSignal) {
  const settings = await runtimeHost.request<{}, Settings>({
    id: nextRpcId("input-settings"), service: "runtime", method: "getSettings", payload: {},
  }, { signal });
  checkFileSize(file.size, kind, settings);
}
