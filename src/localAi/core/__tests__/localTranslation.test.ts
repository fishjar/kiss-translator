import { describe, expect, it, vi } from "vitest";
import { RuntimeManager } from "../../runtime/runtimeManager";
import { getCatalogModel } from "../catalog";

describe("local translation adapter", () => {
  it("refuses an uninstalled model before loading a worker", async () => {
    const createLlmWorker = vi.fn();
    const manager = new RuntimeManager({ workerFactories: { createLlmWorker } });
    vi.spyOn(manager.modelManager, "init").mockResolvedValue(undefined);
    vi.spyOn(manager.modelManager, "get").mockReturnValue(undefined);
    const response = await manager.handleRequest({
      id: "missing-model", service: "translation", method: "translate",
      payload: { modelRef: "qwen2.5-0.5b", text: "hello", fromLang: "en", toLang: "zh-CN" },
    });
    expect(response).toMatchObject({ ok: false, error: { code: "MODEL_NOT_INSTALLED" } });
    expect(createLlmWorker).not.toHaveBeenCalled();
  });

  it("loads an installed model and translates through the LLM worker", async () => {
    const model = getCatalogModel("qwen2.5-0.5b")!;
    const manager = new RuntimeManager({
      workerFactories: {
        createLlmWorker: () => {
          const worker: any = {
            onmessage: null,
            onerror: null,
            postMessage(message: any) {
              if (message.type === "load") queueMicrotask(() => worker.onmessage?.({ data: { type: "ready", backend: "cpu" } }));
              if (message.type === "chat") queueMicrotask(() => worker.onmessage?.({ data: { type: "done", text: "你好", elapsedMs: 1 } }));
            },
            terminate() {},
          };
          return worker as Worker;
        },
      },
    });
    vi.spyOn(manager.modelManager, "init").mockResolvedValue(undefined);
    vi.spyOn(manager.modelManager, "get").mockReturnValue({ manifest: model, state: "installed", files: {} });
    const response = await manager.handleRequest({
      id: "translate", service: "translation", method: "translate",
      payload: { modelRef: model.id, text: "hello", fromLang: "en", toLang: "zh-CN" },
    });
    expect(response).toMatchObject({ ok: true, result: "你好" });
  });
});
