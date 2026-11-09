import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeManager } from "../../runtime/runtimeManager";
import { CATALOG, DOC_MODEL_ID } from "../catalog";

const target = { modelRef: DOC_MODEL_ID, loadSpec: { device: "wasm" } };
const managers: RuntimeManager[] = [];
function setup() {
  let hold = false;
  const workers: any[] = [];
  const mgr = new RuntimeManager({
    workerFactories: {
      createDocWorker: () => {
        const w: any = {
          onmessage: null,
          onerror: null,
          terminate: vi.fn(),
          postMessage: vi.fn((msg: any) => {
            if (hold) return;
            queueMicrotask(() =>
              w.onmessage?.({
                data: {
                  id: msg.id,
                  type: "result",
                  result:
                    msg.type === "load"
                      ? { backend: "wasm" }
                      : {
                          regions: [
                            {
                              id: "r",
                              bbox: [0, 0, 1, 2],
                              polygon: [
                                [0, 0],
                                [1, 2],
                              ],
                            },
                          ],
                          readingOrder: ["r"],
                          imageSize: { width: 1, height: 2 },
                          backend: "wasm",
                          elapsedMs: 1,
                        },
                },
              })
            );
          }),
        };
        workers.push(w);
        return w;
      },
    },
  });
  managers.push(mgr);
  vi.spyOn(mgr.modelManager, "init").mockResolvedValue(undefined);
  vi.spyOn(mgr.modelManager, "get").mockImplementation((id) => ({
    manifest: CATALOG.find((m) => m.id === id)!,
    state: "installed",
    files: {},
  }));
  return {
    mgr,
    workers,
    hold: () => {
      hold = true;
    },
  };
}
let id = 0;
const request = (mgr: RuntimeManager, method: string, payload: any = target) =>
  mgr.handleRequest({
    id: `doc-test-${++id}`,
    service: "doc",
    method,
    payload,
  });
beforeEach(() => {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({
          "kiss-ai-settings": {
            autoUnloadMinutes: 0,
            exclusiveResourceMode: false,
          },
        })),
        set: vi.fn(),
      },
    },
  });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1, height: 2, close: vi.fn() }))
  );
});
afterEach(async () => {
  for (const mgr of managers.splice(0)) await request(mgr, "dispose", {});
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("DOC runtime lifecycle", () => {
  it("autoloads an explicit installed model, reuses it and unloads the worker", async () => {
    const { mgr, workers } = setup();
    const first = await request(mgr, "analyze", {
      ...target,
      blob: new Blob(["image"], { type: "image/png" }),
    });
    expect(first).toMatchObject({
      ok: true,
      result: {
        backend: "wasm",
        imageSize: { width: 1, height: 2 },
        regions: [{ id: "r" }],
      },
    });
    const loaded = await request(mgr, "load");
    expect(loaded).toMatchObject({ ok: true });
    expect(workers).toHaveLength(1);
    expect(
      workers[0].postMessage.mock.calls.filter(([m]: any) => m.type === "load")
    ).toHaveLength(1);
    await request(mgr, "dispose", {});
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it("cancels running inference by terminating the worker and reloads next time", async () => {
    const s = setup();
    await request(s.mgr, "load");
    s.hold();
    const pending = s.mgr.handleRequest({
      id: "doc-cancel",
      service: "doc",
      method: "analyze",
      payload: { ...target, blob: new Blob(["image"]) },
    });
    await vi.waitFor(() =>
      expect(s.workers[0].postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "analyze" })
      )
    );
    s.mgr.cancelRequest("doc-cancel");
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: "REQUEST_CANCELLED" },
    });
    expect(s.workers[0].terminate).toHaveBeenCalledOnce();
    expect(
      (await request(s.mgr, "analyze", { ...target, blob: "invalid" })).ok
    ).toBe(false);
  });
  it("rejects missing external-weight installation, unsupported backend and resource budget before loading", async () => {
    const s = setup();
    await s.mgr.handleRequest({
      id: "doc-budget",
      service: "runtime",
      method: "updateSettings",
      payload: { residentMemoryBudgetMB: 64 },
    });
    expect(await request(s.mgr, "load")).toMatchObject({
      ok: false,
      error: { code: "RESOURCE_BUDGET_EXCEEDED" },
    });
    expect(s.workers).toHaveLength(0);
    expect(
      (
        await request(s.mgr, "load", {
          ...target,
          loadSpec: { device: "webgpu" },
        })
      ).ok
    ).toBe(false);
    vi.mocked(s.mgr.modelManager.get).mockReturnValue({
      manifest: CATALOG.find((m) => m.id === DOC_MODEL_ID)!,
      state: "not-installed",
      files: {},
    });
    expect(await request(s.mgr, "load")).toMatchObject({
      ok: false,
      error: { code: "MODEL_NOT_INSTALLED" },
    });
  });
});
