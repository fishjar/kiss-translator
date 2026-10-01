import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeManager } from "../../runtime/runtimeManager";
import { RuntimePool } from "../../runtime/runtimePool";
import { InPageRuntimeHost } from "../../runtime/runtimeHostAdapter";
import { CATALOG, getCatalogModel } from "../catalog";
import { resolveModelTarget } from "../modelTarget";
import { normalizeSettings } from "../settings";
import { estimateModelMemoryMB } from "../modelMemory";
import { LlmClient } from "../llmClient";
import { VlmClient } from "../vlmClient";

let sequence = 0;
const targets = { llm: "qwen2.5-0.5b", vlm: "paddleocr-vl-1.6-q4" };
function setup() {
  const events: string[] = [], workers: any[] = [];
  let unloadDelay = 0, unloadFailure = false, noAck = false, hold = false;
  const manager = new RuntimeManager({ workerFactories: {
    createLlmWorker: (_runtime, service) => {
      let model = "", terminated = false;
      const w: any = { service, onmessage: null, onerror: null,
        postMessage(msg: any) {
          if (terminated) throw Error("terminated");
          const reply = (data: any) => { if (!terminated) w.onmessage?.({ data }); };
          if (msg.type === "load") { model = msg.dir; events.push(`load:${service}`); reply({ type: "ready", backend: "cpu" }); }
          if (msg.type === "chat") { events.push(`chat:${service}`); if (!hold) reply({ type: "done", text: model, elapsedMs: 1 }); }
          if (msg.type === "stop") reply({ type: "done", text: model, elapsedMs: 1, aborted: true });
          if (msg.type === "unload") {
            events.push(`unload:${service}`);
            if (noAck) return;
            const finish = () => { events.push(`released:${service}`); reply(unloadFailure ? { type: "error", message: "cleanup failed" } : { type: "unloaded" }); };
            if (unloadDelay) setTimeout(finish, unloadDelay); else finish();
          }
        },
        terminate() { terminated = true; events.push(`terminated:${service}`); },
      };
      workers.push(w); return w;
    },
  }});
  vi.spyOn(manager.modelManager, "init").mockResolvedValue(undefined);
  vi.spyOn(manager.modelManager, "get").mockImplementation(id => ({ manifest: getCatalogModel(id)!, state: "installed", files: {} }));
  const rpc = (service: any, method: string, payload = {}) => manager.handleRequest({ id: `split-${++sequence}`, service, method, payload });
  const load = (service: "llm" | "vlm", modelRef = targets[service]) => rpc(service, "load", { modelRef, loadSpec: { device: "wasm" } });
  return { manager, rpc, load, events, workers, delay: (ms: number) => { unloadDelay = ms; }, fail: () => { unloadFailure = true; }, noAck: () => { noAck = true; }, hold: () => { hold = true; } };
}
beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ exclusiveResourceMode: false }), setItem: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("independent language model services", () => {
  it("unloads the previous model by default before loading another service", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    const s = setup();
    await s.load("llm"); await s.load("vlm");
    expect(s.manager.getSessionState("llm").state).toBe("unloaded");
    expect(s.manager.getSessionState("vlm").state).toBe("ready");
    expect(s.events.indexOf("released:llm")).toBeLessThan(s.events.indexOf("load:vlm"));
    await s.rpc("vlm", "unload");
  });

  it("passes explicit generation parameters and requested device to the worker", async () => {
    const s = setup();
    await s.load("llm");
    const sent = vi.spyOn(s.workers[0], "postMessage");
    const response = await s.rpc("llm", "chat", {
      modelRef: targets.llm, loadSpec: { device: "wasm" },
      messages: [{ role: "system", content: "Translate" }, { role: "user", content: "hello" }],
      temperature: 0, maxTokens: 123,
    });
    expect(response.ok).toBe(true);
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({ type: "chat", temperature: 0, maxTokens: 123,
      messages: [{ role: "system", content: "Translate" }, { role: "user", content: "hello" }] }));
    expect(s.manager.getSessionState("llm").loadSpec?.device).toBe("wasm");
    await s.rpc("llm", "unload");
  });

  it("routes compatible catalog models and rejects cross-service targets", () => {
    expect(resolveModelTarget("vlm", { modelRef: targets.vlm }).spec.runtime).toBe("wllama");
    expect(resolveModelTarget("vlm", { modelRef: "glm-ocr-onnx-q4" }).spec.runtime).toBe("onnx");
    expect(() => resolveModelTarget("llm", { modelRef: targets.vlm })).toThrow("INVALID_MODEL");
    expect(() => resolveModelTarget("vlm", { modelRef: targets.llm })).toThrow("INVALID_MODEL");
  });
  it("keeps separate clients, versions, instances and unload notifications", async () => {
    const s = setup(), host = new InPageRuntimeHost({ manager: s.manager });
    const llm = new LlmClient(host), vlm = new VlmClient(host);
    const spec = (service: "llm" | "vlm") => resolveModelTarget(service, { modelRef: targets[service], loadSpec: { device: "wasm" } }).spec as any;
    await llm.load(spec("llm"), { modelRef: targets.llm });
    const version = llm.sessionVersion;
    await vlm.load(spec("vlm"), { modelRef: targets.vlm });
    expect(llm.loaded && vlm.loaded).toBe(true);
    expect(llm.sessionVersion).toBe(version);
    expect(s.workers).toHaveLength(2);
    await vlm.unload();
    expect(vlm.loaded).toBe(false); expect(llm.loaded).toBe(true);
    expect(s.manager.getSessionState("llm").state).toBe("ready");
    expect(s.events.indexOf("released:vlm")).toBeLessThan(s.events.indexOf("terminated:vlm"));
  });
  it("switches VLM engines without unloading LLM", async () => {
    const s = setup(); await s.load("llm"); const version = s.manager.getSessionState("llm").sessionVersion;
    await s.load("vlm"); await s.load("vlm", "glm-ocr-onnx-q4");
    expect(s.manager.getSessionState("llm").sessionVersion).toBe(version);
    expect(s.events).not.toContain("unload:llm"); expect(s.events).toContain("released:vlm");
  });
  it("awaits release acknowledgement before exclusive loading", async () => {
    const s = setup(); await s.rpc("runtime", "updateSettings", { exclusiveResourceMode: true });
    await s.load("llm"); s.delay(20); await s.load("vlm");
    expect(s.events.indexOf("released:llm")).toBeLessThan(s.events.indexOf("load:vlm"));
    expect(s.manager.pool.list().map(e => e.service)).toEqual(["vlm"]);
  });
  it("enabling exclusive mode keeps the last used service", async () => {
    const s = setup(); await s.load("llm"); await s.load("vlm");
    await s.rpc("runtime", "updateSettings", { exclusiveResourceMode: true });
    expect(s.manager.getSessionState("llm").state).toBe("unloaded");
    expect(s.manager.getSessionState("vlm").state).toBe("ready");
    await s.rpc("runtime", "updateSettings", { exclusiveResourceMode: false });
    expect(s.events.filter(e => e.startsWith("load:"))).toHaveLength(2);
  });
  it("blocks exclusive loading on release failure and clears the terminated session", async () => {
    const s = setup(); await s.rpc("runtime", "updateSettings", { exclusiveResourceMode: true }); await s.load("llm"); s.fail();
    expect((await s.load("vlm")).ok).toBe(false);
    expect(s.events).not.toContain("load:vlm"); expect(s.manager.getSessionState("llm").state).toBe("unloaded");
    expect(s.manager.pool.list()).toEqual([]);
  });
  it("times out missing release confirmation without starting the next worker", async () => {
    vi.useFakeTimers(); const s = setup(); await s.rpc("runtime", "updateSettings", { exclusiveResourceMode: true }); await s.load("llm"); s.noAck();
    const next = s.load("vlm"); await vi.advanceTimersByTimeAsync(5001);
    expect(await next).toMatchObject({ ok: false, error: { code: "RESOURCE_RELEASE_FAILED" } });
    expect(s.events).not.toContain("load:vlm"); expect(s.manager.getSessionState("llm").state).toBe("unloaded");
  });
  it("cancels VLM while preserving LLM residency", async () => {
    const s = setup(); await s.load("llm"); await s.load("vlm"); s.hold();
    const id = `cancel-${++sequence}`;
    const task = s.manager.handleRequest({ id, service: "vlm", method: "chat", payload: { modelRef: targets.vlm, messages: [{ role: "user", content: "parse" }], maxTokens: 8 } });
    await vi.waitFor(() => expect(s.events).toContain("chat:vlm")); s.manager.cancelRequest(id);
    expect(await task).toMatchObject({ ok: false, error: { code: "REQUEST_CANCELLED" } });
    expect(s.manager.getSessionState("llm").state).toBe("ready");
  });
  it("protects active generation from manual resource eviction", async () => {
    const s = setup(); await s.load("vlm"); s.hold(); const id = `pin-${++sequence}`;
    const task = s.manager.handleRequest({ id, service: "vlm", method: "chat", payload: { messages: [], maxTokens: 8 } });
    await vi.waitFor(() => expect(s.events).toContain("chat:vlm"));
    expect(await s.rpc("runtime", "evictOne")).toMatchObject({ result: { evicted: null } });
    s.manager.cancelRequest(id); await task;
  });
  it("cleans a crashed VLM worker without invalidating LLM", async () => {
    const s = setup(); await s.load("llm"); await s.load("vlm");
    s.workers[1].onerror({ message: "crash" });
    expect(s.manager.getSessionState("vlm").state).toBe("unloaded");
    expect(s.manager.getSessionState("llm").state).toBe("ready");
  });
  it("cleans OOM inference while preserving the other service", async () => {
    const s = setup(); await s.load("llm"); await s.load("vlm");
    const worker = s.workers[1], post = worker.postMessage.bind(worker);
    worker.postMessage = (message: any) => message.type === "chat" ? worker.onmessage({ data: { type: "error", message: "OUT_OF_MEMORY: test" } }) : post(message);
    expect(await s.rpc("vlm", "chat", { messages: [], maxTokens: 1 } as any)).toMatchObject({ ok: false, error: { code: "OUT_OF_MEMORY" } });
    expect(s.manager.getSessionState("vlm").state).toBe("unloaded");
    expect(s.manager.getSessionState("llm").state).toBe("ready");
  });
  it("ignores late errors from a replaced worker", async () => {
    const s = setup(); await s.load("vlm"); const old = s.workers[0]; await s.load("vlm", "glm-ocr-onnx-q4");
    const version = s.manager.getSessionState("vlm").sessionVersion;
    old.onerror({ message: "late error" });
    expect(s.manager.getSessionState("vlm")).toMatchObject({ state: "ready", sessionVersion: version });
  });
  it("arms separate idle unload timers", async () => {
    vi.useFakeTimers(); const s = setup(); await s.load("llm"); await vi.advanceTimersByTimeAsync(300000); await s.load("vlm");
    await vi.advanceTimersByTimeAsync(300000);
    expect(s.manager.getSessionState("llm").state).toBe("unloaded"); expect(s.manager.getSessionState("vlm").state).toBe("ready");
    await vi.advanceTimersByTimeAsync(300000); expect(s.manager.getSessionState("vlm").state).toBe("unloaded");
  });
});

describe("estimated resident budget", () => {
  it("includes vision projection weights and legacy settings defaults", () => {
    const m = getCatalogModel(targets.vlm)!;
    expect(estimateModelMemoryMB({ dir: m.dir })).toBe(Math.ceil(m.files.filter(f => f.path.endsWith(".gguf")).reduce((n, f) => n + f.size, 0) * 2 / 1048576) + 256);
    expect(normalizeSettings({}).residentMemoryBudgetMB).toBe(0);
    expect(normalizeSettings({ residentMemoryBudgetMB: -1 }).residentMemoryBudgetMB).toBe(0);
  });
  it("evicts idle peers before admitting a model within the budget", async () => {
    const s = setup(); const cost = (service: "llm" | "vlm") => estimateModelMemoryMB(resolveModelTarget(service, { modelRef: targets[service] }).spec);
    await s.rpc("runtime", "updateSettings", { residentMemoryBudgetMB: Math.max(cost("llm"), cost("vlm")) });
    await s.load("llm"); expect((await s.load("vlm")).ok).toBe(true);
    expect(s.manager.pool.list().map(e => e.service)).toEqual(["vlm"]);
  });
  it("validates the incoming budget before exclusive release", async () => {
    const s = setup(); const cost = estimateModelMemoryMB(resolveModelTarget("llm", { modelRef: targets.llm }).spec);
    await s.rpc("runtime", "updateSettings", { residentMemoryBudgetMB: cost, exclusiveResourceMode: true }); await s.load("llm");
    expect(await s.load("vlm")).toMatchObject({ ok: false, error: { code: "RESOURCE_BUDGET_EXCEEDED" } });
    expect(s.manager.getSessionState("llm").state).toBe("ready"); expect(s.events).not.toContain("unload:llm");
  });
  it("rejects an oversized model and validates settings", async () => {
    const s = setup(); await s.rpc("runtime", "updateSettings", { residentMemoryBudgetMB: 1 });
    expect(await s.load("vlm")).toMatchObject({ ok: false, error: { code: "RESOURCE_BUDGET_EXCEEDED" } });
    expect(s.workers).toHaveLength(0);
    expect((await s.rpc("runtime", "updateSettings", { residentMemoryBudgetMB: -1 })).ok).toBe(false);
  });
  it("lowering a budget immediately evicts existing idle models", async () => {
    const s = setup(); await s.load("llm"); await s.load("vlm");
    const cost = estimateModelMemoryMB(resolveModelTarget("vlm", { modelRef: targets.vlm }).spec);
    expect((await s.rpc("runtime", "updateSettings", { residentMemoryBudgetMB: cost })).ok).toBe(true);
    expect(s.manager.pool.list().map(e => e.service)).toEqual(["vlm"]);
  });
  it("cannot evict pinned/loading entries to satisfy a budget", async () => {
    const pool = new RuntimePool(); pool.setMemoryBudget(100);
    pool.register({ key: "decision", service: "decision", modelId: "jev", memoryMB: 80, state: "ready", pinned: true, unloadFn: vi.fn() });
    await expect(pool.reserve("vlm", 30)).rejects.toThrow("RESOURCE_BUDGET_EXCEEDED");
    expect(pool.list()).toHaveLength(1);
  });
});
