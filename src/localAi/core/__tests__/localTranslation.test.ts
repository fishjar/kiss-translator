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
              if (message.type === "unload") queueMicrotask(() => worker.onmessage?.({ data: { type: "unloaded" } }));
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

  it("loads an installed model automatically on cold start when calling llm chat with modelRef", async () => {
    const model = getCatalogModel("qwen2.5-0.5b")!;
    let loadedModelDir = "";
    const manager = new RuntimeManager({
      workerFactories: {
        createLlmWorker: () => {
          const worker: any = {
            onmessage: null,
            onerror: null,
            postMessage(message: any) {
              if (message.type === "unload") queueMicrotask(() => worker.onmessage?.({ data: { type: "unloaded" } }));
              if (message.type === "load") {
                loadedModelDir = message.dir;
                queueMicrotask(() =>
                  worker.onmessage?.({ data: { type: "ready", backend: "cpu" } })
                );
              }
              if (message.type === "chat") {
                queueMicrotask(() =>
                  worker.onmessage?.({
                    data: { type: "done", text: "视频总结内容", elapsedMs: 1 },
                  })
                );
              }
            },
            terminate() {},
          };
          return worker as Worker;
        },
      },
    });
    vi.spyOn(manager.modelManager, "init").mockResolvedValue(undefined);
    vi.spyOn(manager.modelManager, "get").mockReturnValue({
      manifest: model,
      state: "installed",
      files: {},
    });

    // 冷启动：此时 manager 未加载任何会话
    const response = await manager.handleRequest({
      id: "summary-cold-start",
      service: "llm",
      method: "chat",
      payload: {
        modelRef: model.id,
        messages: [{ role: "user", content: "请总结视频" }],
        maxTokens: 2048,
      },
    });

    expect(response).toMatchObject({
      ok: true,
      result: { text: "视频总结内容" },
    });
    expect(loadedModelDir).toBe(model.dir);
  });

  it("switches model automatically when llm chat requests a different modelRef", async () => {
    const model1 = getCatalogModel("qwen2.5-0.5b")!;
    const model2 = getCatalogModel("qwen2.5-1.5b")!;
    const loadedDirs: string[] = [];

    const manager = new RuntimeManager({
      workerFactories: {
        createLlmWorker: () => {
          const worker: any = {
            onmessage: null,
            onerror: null,
            postMessage(message: any) {
              if (message.type === "unload") queueMicrotask(() => worker.onmessage?.({ data: { type: "unloaded" } }));
              if (message.type === "load") {
                loadedDirs.push(message.dir);
                queueMicrotask(() =>
                  worker.onmessage?.({ data: { type: "ready", backend: "cpu" } })
                );
              }
              if (message.type === "chat") {
                queueMicrotask(() =>
                  worker.onmessage?.({
                    data: {
                      type: "done",
                      text: `response-from-${message.dir || loadedDirs[loadedDirs.length - 1]}`,
                      elapsedMs: 1,
                    },
                  })
                );
              }
            },
            terminate() {},
          };
          return worker as Worker;
        },
      },
    });

    vi.spyOn(manager.modelManager, "init").mockResolvedValue(undefined);
    vi.spyOn(manager.modelManager, "get").mockImplementation((id: string) => {
      if (id === model1.id) return { manifest: model1, state: "installed", files: {} };
      if (id === model2.id) return { manifest: model2, state: "installed", files: {} };
      return undefined;
    });

    // 1. 先用 Model 1
    const res1 = await manager.handleRequest({
      id: "chat-model-1",
      service: "llm",
      method: "chat",
      payload: {
        modelRef: model1.id,
        messages: [{ role: "user", content: "hello" }],
        maxTokens: 2048,
      },
    });
    expect(res1).toMatchObject({ ok: true });
    expect(loadedDirs).toContain(model1.dir);

    // 2. 再用 Model 2，验证触发模型切换与加载
    const res2 = await manager.handleRequest({
      id: "chat-model-2",
      service: "llm",
      method: "chat",
      payload: {
        modelRef: model2.id,
        messages: [{ role: "user", content: "hello" }],
        maxTokens: 2048,
      },
    });
    expect(res2).toMatchObject({ ok: true });
    expect(loadedDirs).toEqual([model1.dir, model2.dir]);
  });
});
