import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RuntimeManager } from "../../runtime/runtimeManager";
import {
  captureDiagnostic,
  diagnosticDetail,
} from "../../../libs/diagnostics/transport";
import { DEFAULT_SETTINGS } from "../types";

vi.mock("../../../libs/diagnostics/transport", () => ({
  captureDiagnostic: vi.fn(),
  diagnosticDetail: vi.fn(async () => ({ enabled: false })),
}));
vi.mock("../settings", () => ({
  loadSettings: async () => ({ ...DEFAULT_SETTINGS, autoUnloadMinutes: 0 }),
  normalizeSettings: (value: unknown) => value,
  saveSettings: async () => {},
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("cancels a DOC load while diagnostic policy is still pending", async () => {
  const { CATALOG, DOC_MODEL_ID } = await import("../catalog");
  let resolveDetail!: (value: { enabled: boolean; expiresAt: number }) => void;
  vi.mocked(diagnosticDetail).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveDetail = resolve;
    })
  );
  const worker: any = {
    terminate: vi.fn(),
    postMessage: vi.fn((message: any) => {
      queueMicrotask(() =>
        worker.onmessage?.({
          data: { id: message.id, type: "result", result: { backend: "wasm" } },
        })
      );
    }),
  };
  const createDocWorker = vi.fn(() => worker);
  const manager = new RuntimeManager({ workerFactories: { createDocWorker } });
  vi.spyOn(manager.modelManager, "init").mockResolvedValue(undefined);
  vi.spyOn(manager.modelManager, "get").mockReturnValue({
    manifest: CATALOG.find((model) => model.id === DOC_MODEL_ID)!,
    state: "installed",
    files: {},
  });
  const request = {
    id: "cancel-before-policy",
    service: "doc" as const,
    method: "load",
    payload: { modelRef: DOC_MODEL_ID, loadSpec: { device: "wasm" } },
  };
  const pending = manager.handleRequest(request);
  const cancelled = manager.cancelRequest(request.id);
  resolveDetail({ enabled: false, expiresAt: 0 });
  const response = await pending;
  expect(cancelled).toBe(true);
  expect(response).toMatchObject({
    ok: false,
    error: { code: "REQUEST_CANCELLED" },
  });
  expect(createDocWorker).not.toHaveBeenCalled();
  expect(manager.cancelRequest(request.id)).toBe(false);
  // Reusing the ID must not inherit the previous cancellation.
  expect((await manager.handleRequest(request)).ok).toBe(true);
});

it("host records request completion and failure without forwarding input", async () => {
  const manager = new RuntimeManager();
  const success = await manager.handleRequest({
    id: "success",
    service: "runtime",
    method: "evictOne",
    payload: { text: "PRIVATE_INPUT" },
  });
  expect(success.ok).toBe(true);
  const failure = await manager.handleRequest({
    id: "failure",
    service: "runtime",
    method: "unknown",
    payload: { text: "PRIVATE_INPUT" },
  });
  expect(failure.ok).toBe(false);
  const calls = vi
    .mocked(captureDiagnostic)
    .mock.calls.map(([record]) => record);
  expect(calls.map((record) => record.event)).toEqual([
    "request.started",
    "request.completed",
    "request.started",
    "request.failed",
  ]);
  expect(calls[3]).toMatchObject({
    level: "error",
    module: "local-ai",
    context: { requestId: "failure", code: "INFERENCE_FAILED" },
  });
  expect(JSON.stringify(calls)).not.toContain("PRIVATE_INPUT");
});

it("status polling produces no log stream", async () => {
  const manager = new RuntimeManager();
  for (let index = 0; index < 5; index++)
    await manager.handleRequest({
      id: `status-${index}`,
      service: "runtime",
      method: "status",
      payload: {},
    });
  expect(captureDiagnostic).not.toHaveBeenCalled();
});

it("links nested RPC failures to the business task without a second ERROR", async () => {
  await new RuntimeManager().handleRequest({
    id: "nested-rpc",
    service: "runtime",
    method: "unknown",
    payload: {},
    diagnostic: { taskId: "translation-task", attempt: 2 },
  });
  expect(vi.mocked(captureDiagnostic).mock.calls.at(-1)?.[0]).toMatchObject({
    level: "warn",
    event: "request.failed",
    context: {
      taskId: "translation-task",
      requestId: "nested-rpc",
      attempt: 2,
    },
  });
});

it.each([
  ["decision", "ensureJevWorker", []],
  ["asr", "ensureAsrWorker", []],
  ["llm", "ensureLlmWorker", ["onnx", "llm"]],
  ["vlm", "ensureLlmWorker", ["onnx", "vlm"]],
  ["tts", "ensureTtsWorker", []],
])(
  "idle %s Worker crashes produce a host diagnostic",
  (service, method, args) => {
    const worker = { terminate: vi.fn(), postMessage: vi.fn() } as any;
    const manager = new RuntimeManager({
      workerFactories: {
        createJevWorker: () => worker,
        createAsrWorker: () => worker,
        createLlmWorker: () => worker,
        createTtsWorker: () => worker,
      },
    });
    (manager as any)[method as string](...(args as string[]));
    worker.onerror({
      message: "PRIVATE_ERROR",
      error: new Error("PRIVATE_ERROR"),
    });
    expect(captureDiagnostic).toHaveBeenCalledOnce();
    expect(captureDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        event: "worker.crashed",
        context: expect.objectContaining({ service, code: "WORKER_CRASHED" }),
      })
    );
  }
);

it.each(["idle", "active", "cancel", "timeout"])(
  "DOC Worker diagnostics during %s",
  async (mode) => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1, height: 2, close: vi.fn() }))
    );
    const { CATALOG, DOC_MODEL_ID } = await import("../catalog");
    let hold = false;
    const worker: any = {
      terminate: vi.fn(),
      postMessage: vi.fn((message: any) => {
        if (hold) return;
        queueMicrotask(() =>
          worker.onmessage?.({
            data: {
              id: message.id,
              type: "result",
              result: { backend: "wasm" },
            },
          })
        );
      }),
    };
    const manager = new RuntimeManager({
      workerFactories: { createDocWorker: () => worker },
    });
    vi.spyOn(manager.modelManager, "init").mockResolvedValue(undefined);
    vi.spyOn(manager.modelManager, "get").mockReturnValue({
      manifest: CATALOG.find((model) => model.id === DOC_MODEL_ID)!,
      state: "installed",
      files: {},
    });
    const payload = { modelRef: DOC_MODEL_ID, loadSpec: { device: "wasm" } };
    expect(
      (
        await manager.handleRequest({
          id: "load",
          service: "doc",
          method: "load",
          payload,
        })
      ).ok
    ).toBe(true);
    vi.mocked(captureDiagnostic).mockClear();
    hold = true;
    if (mode === "idle") {
      worker.onerror({ message: "PRIVATE_ERROR" });
      expect(captureDiagnostic).toHaveBeenCalledOnce();
      expect(captureDiagnostic).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "worker.crashed",
          context: expect.objectContaining({
            service: "doc",
            modelId: worker.postMessage.mock.calls[0][0].spec.dir,
          }),
        })
      );
      return;
    }
    const pending = manager.handleRequest({
      id: mode,
      service: "doc",
      method: "analyze",
      payload: { ...payload, blob: new Blob(["PRIVATE_INPUT"]) },
      ...(mode === "timeout" ? { deadlineMs: 100 } : {}),
    });
    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "analyze" })
      )
    );
    for (let i = 0; i < 100; i++)
      worker.onmessage({ data: { type: "progress", status: "working" } });
    if (mode === "active") worker.onerror({ message: "PRIVATE_ERROR" });
    if (mode === "cancel") manager.cancelRequest(mode);
    expect((await pending).ok).toBe(false);
    const events = vi
      .mocked(captureDiagnostic)
      .mock.calls.map(([record]) => record);
    expect(events.map((record) => record.event)).toEqual(
      mode === "active"
        ? [
            "request.started",
            "request.stage",
            "worker.crashed",
            "request.failed",
          ]
        : ["request.started", "request.stage", "request.failed"]
    );
    if (mode !== "active")
      expect(events[events.length - 1].context?.code).toBe(
        mode === "cancel" ? "REQUEST_CANCELLED" : "REQUEST_TIMEOUT"
      );
    expect(JSON.stringify(events)).not.toContain("PRIVATE_INPUT");
  }
);

it("quiet successful polling, repeated failure merging, and recovery", async () => {
  const manager = new RuntimeManager();
  const stats = vi.spyOn((manager as any).inferenceCache, "stats");
  stats.mockRejectedValue(new Error("PRIVATE_FAILURE"));
  for (let i = 0; i < 3; i++)
    await manager.handleRequest({
      id: `poll-${i}`,
      service: "runtime",
      method: "cacheStats",
      payload: {},
    });
  expect(vi.mocked(captureDiagnostic).mock.calls.map(([r]) => r.event)).toEqual(
    ["poll.failed"]
  );
  stats.mockResolvedValue({ count: 0, bytes: 0 });
  await manager.handleRequest({
    id: "recovered",
    service: "runtime",
    method: "cacheStats",
    payload: {},
  });
  await manager.handleRequest({
    id: "quiet",
    service: "runtime",
    method: "cacheStats",
    payload: {},
  });
  expect(vi.mocked(captureDiagnostic).mock.calls.map(([r]) => r.event)).toEqual(
    ["poll.failed", "poll.recovered"]
  );
  expect(vi.mocked(captureDiagnostic).mock.calls[1][0].context).toMatchObject({
    repeated: 3,
  });
});
