import { runtimeHost } from "../runtime/runtimeHostAdapter";
import { nextRpcId, type ServiceSessionState } from "../runtime/rpc";
import type { RuntimeEntry } from "../runtime/runtimePool";
import type { Settings } from "./types";

export interface RuntimeStatus {
  scheduler: { active: number; queued: number };
  pool: RuntimeEntry[];
  sessions: Record<string, ServiceSessionState>;
}

export function getRuntimeStatus() {
  return runtimeHost.request<{}, RuntimeStatus>({ id: nextRpcId("runtime-status"), service: "runtime", method: "status", payload: {} });
}

export function getRuntimeSettings() {
  return runtimeHost.request<{}, Settings>({ id: nextRpcId("runtime-settings"), service: "runtime", method: "getSettings", payload: {} });
}

export function updateRuntimeSettings(patch: Partial<Settings>) {
  return runtimeHost.request<Partial<Settings>, Settings>({ id: nextRpcId("runtime-settings"), service: "runtime", method: "updateSettings", payload: patch });
}
