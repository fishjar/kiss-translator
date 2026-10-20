import { createLocalAsrInvoker } from "./local-asr-runtime";
import { createAssetStore } from "../providers/transport";
import { runtimeHost } from "../localAi/runtime/runtimeHostAdapter";
import { decodeAudioFile } from "../localAi/core/recorder";

jest.mock("../localAi/runtime/runtimeHostAdapter", () => ({
  runtimeHost: { request: jest.fn() },
}));
jest.mock("../localAi/core/modelTarget", () => ({
  resolveModelTarget: jest.fn(),
}));
jest.mock("../localAi/core/recorder", () => ({
  decodeAudioFile: jest.fn(async () => ({
    audio: new Float32Array([0.5]),
    sampleRate: 16000,
  })),
  resampleTo16k: (audio) => audio,
}));
const instance = {
  apiSlug: "local",
  apiType: "LocalAI",
  modelRef: "sensevoice-small",
  enabledCapabilities: ["transcribe"],
};
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function setup() {
  decodeAudioFile.mockResolvedValue({
    audio: new Float32Array([0.5]),
    sampleRate: 16000,
  });
  const assets = createAssetStore();
  const input = {
    audio: assets.put(new Blob(["wav"], { type: "audio/wav" })),
    requireTimestamps: false,
  };
  const manager = {
    cancelRequest: jest.fn(),
    handleRequest: jest.fn(async (request, hooks) => {
      hooks.onProgress({ loaded: 1, total: 2, status: "loading" });
      return {
        id: request.id,
        ok: true,
        result: { segments: [{ start: 0, end: 1, text: "hello" }] },
      };
    }),
  };
  const invoke = createLocalAsrInvoker(manager);
  return { manager, invoke, assets, input };
}

test("hosted local ASR uses the supplied shared manager and forwards progress", async () => {
  const test = setup();
  const call = test.invoke(instance, "transcribe", test.input, {
    assets: test.assets,
  });
  const events = [];
  const pump = (async () => {
    for await (const event of call.events) events.push(event);
  })();
  await expect(call.result).resolves.toMatchObject({
    text: "hello",
    segments: [{ start: 0, end: 1, text: "hello" }],
  });
  await pump;
  expect(test.manager.handleRequest).toHaveBeenCalledTimes(1);
  expect(test.manager.handleRequest.mock.calls[0][0]).toMatchObject({
    service: "asr",
    method: "transcribe",
    payload: { modelRef: "sensevoice-small", audio: expect.any(Float32Array) },
  });
  expect(events).toContainEqual(
    expect.objectContaining({ type: "progress", progress: 0.5 })
  );
  expect(runtimeHost.request).not.toHaveBeenCalled();
});

test("hosted cancellation reaches the same manager; late results cannot become subtitles", async () => {
  const test = setup();
  let resolve;
  test.manager.handleRequest.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const call = test.invoke(instance, "transcribe", test.input, {
    assets: test.assets,
  });
  const rejected = expect(call.result).rejects.toMatchObject({
    code: "REQUEST_CANCELLED",
  });
  await flush();
  call.cancel();
  await rejected;
  expect(test.manager.cancelRequest).toHaveBeenCalled();
  resolve({
    ok: true,
    result: { segments: [{ start: 0, end: 1, text: "old" }] },
  });
  await call.finished;
});

test.each([
  { ...instance, isDisabled: true },
  { ...instance, enabledCapabilities: [] },
  {
    ...instance,
    provider: {
      apiVersion: "1",
      source: { external: true },
      implementation: { kind: "native", entry: "LocalAI" },
    },
  },
])("disabled or untrusted local services cannot run: %j", async (api) => {
  const test = setup();
  const call = test.invoke(api, "transcribe", test.input, {
    assets: test.assets,
  });
  await expect(call.result).rejects.toBeDefined();
  expect(test.manager.handleRequest).not.toHaveBeenCalled();
});
