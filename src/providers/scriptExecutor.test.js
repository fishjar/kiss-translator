import { createScriptExecutor } from "./scriptExecutor";
import { Blob as NodeBlob } from "buffer";
import { createAssetStore } from "./transport";

test("script executor terminates worker on cancellation and ignores delayed SDK results", async () => {
  const worker = { postMessage: jest.fn(), terminate: jest.fn() };
  const controller = new AbortController();
  const ctx = {
    signal: controller.signal,
    config: {},
    serviceId: "instance",
    options: {},
    requestId: "r",
    http: { request: jest.fn() },
    emit: jest.fn(),
  };
  const execute = createScriptExecutor(() => worker);
  const result = execute({ code: "exports.chat = () => 1" }, "chat", {}, ctx);
  await Promise.resolve();
  expect(worker.postMessage.mock.calls[0][0].serviceId).toBe("instance");
  controller.abort(new Error("cancelled"));
  await expect(result).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  await worker.onmessage({
    data: { type: "sdk", id: 1, method: "request", args: {} },
  });
  expect(ctx.http.request).not.toHaveBeenCalled();
});

test("script synchronous computation watchdog terminates an unresponsive worker", async () => {
  jest.useFakeTimers();
  const worker = { postMessage: jest.fn(), terminate: jest.fn() };
  const execute = createScriptExecutor(() => worker);
  const result = execute(
    { code: "while(true) {}" },
    "chat",
    {},
    { signal: new AbortController().signal, config: {}, options: {} }
  );
  await Promise.resolve();
  jest.advanceTimersByTime(1000);
  await expect(result).rejects.toMatchObject({ code: "SCRIPT_TIMEOUT" });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

test("asset read RPC transfers only this task's bytes and rejects unknown IDs", async () => {
  const worker = { postMessage: jest.fn(), terminate: jest.fn() };
  const assets = createAssetStore();
  const ref = assets.put(new NodeBlob([Uint8Array.from([0, 255, 42])]));
  const controller = new AbortController();
  const result = createScriptExecutor(() => worker)(
    { code: "exports.read = () => {}" },
    "read",
    {},
    { signal: controller.signal, assets, config: {}, options: {} }
  );
  await Promise.resolve();
  await worker.onmessage({
    data: { type: "sdk", id: 1, method: "asset.read", args: ref },
  });
  const reply = worker.postMessage.mock.calls[1];
  expect(new Uint8Array(reply[0].result)).toEqual(
    Uint8Array.from([0, 255, 42])
  );
  expect(reply[1]).toEqual([reply[0].result]);
  await worker.onmessage({
    data: {
      type: "sdk",
      id: 2,
      method: "asset.read",
      args: { assetId: "asset-999" },
    },
  });
  expect(worker.postMessage.mock.calls[2][0].error.code).toBe(
    "ASSET_UNAVAILABLE"
  );
  controller.abort();
  await expect(result).rejects.toBeDefined();
});

test("an unawaited pending HTTP call cannot disable the computation watchdog", async () => {
  jest.useFakeTimers();
  const worker = { postMessage: jest.fn(), terminate: jest.fn() };
  const controller = new AbortController();
  const result = createScriptExecutor(() => worker)(
    { code: "bad" },
    "chat",
    {},
    {
      signal: controller.signal,
      config: {},
      options: {},
      http: { request: () => new Promise(() => {}) },
    }
  );
  await Promise.resolve();
  void worker.onmessage({
    data: { type: "sdk", id: 1, method: "request", args: {} },
  });
  jest.advanceTimersByTime(1000);
  await expect(result).rejects.toMatchObject({ code: "SCRIPT_TIMEOUT" });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
