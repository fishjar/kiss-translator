import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeManager } from "../../runtime/runtimeManager";
import { CATALOG, OCR_GROUPS } from "../catalog";
import { normalizeSettings } from "../settings";
import { InPageRuntimeHost } from "../../runtime/runtimeHostAdapter";
import { AsrClient } from "../asrClient";

let requestId = 0;
const request = (
  mgr: RuntimeManager,
  service: any,
  method: string,
  payload: any = {}
) =>
  mgr.handleRequest({
    id: `resources-${++requestId}`,
    service,
    method,
    payload,
  });
const configure = (mgr: RuntimeManager, patch: any) =>
  request(mgr, "runtime", "updateSettings", patch);

function setup(ocrResult?: any) {
  const events: string[] = [];
  const messages: { service: string; payload: any }[] = [];
  let alive = 0;
  let peak = 0;
  let completeChat: (() => void) | undefined;
  let holdChat = false;
  let ocrCleanup: (() => Promise<void>) | undefined;
  const worker = (service: string) => {
    events.push(`create:${service}`);
    if (service !== "decision") peak = Math.max(peak, ++alive);
    let terminated = false;
    let dir = "";
    const w: any = {
      onmessage: null,
      onerror: null,
      postMessage(msg: any) {
        messages.push({ service, payload: msg });
        const reply = (data: any) =>
          queueMicrotask(() => {
            if (!terminated) w.onmessage?.({ data });
          });
        if (msg.type === "load") {
          dir = msg.dir;
          events.push(`load:${dir}`);
          reply({ type: "ready", backend: "cpu" });
        }
        if (msg.type === "chat") {
          const done = () => {
            events.push("chat:done");
            reply({ type: "done", text: dir, elapsedMs: 1 });
          };
          completeChat = done;
          if (!holdChat) done();
        }
        if (msg.type === "stop") completeChat?.();
        if (msg.type === "transcribe")
          reply({
            type: "result",
            segments: [],
            elapsedMs: 1,
            durationSeconds: 1,
          });
        if (msg.type === "predict")
          reply({ type: "result", id: msg.id, result: {} });
        if (msg.type === "synthesize")
          reply({
            type: "result",
            audio: new Float32Array(1),
            sampleRate: 16000,
          });
      },
      terminate() {
        if (!terminated) {
          terminated = true;
          if (service !== "decision") alive--;
          events.push(`destroy:${service}`);
        }
      },
    };
    return w as Worker;
  };
  const mgr = new RuntimeManager({
    workerFactories: {
      createAsrWorker: () => worker("asr"),
      createLlmWorker: () => worker("llm"),
      createTtsWorker: () => worker("tts"),
      createJevWorker: () => worker("decision"),
      createOcrInstance: async () => {
        peak = Math.max(peak, ++alive);
        events.push("create:ocr");
        let disposed = false;
        return {
          getInitializationSummary: () => ({
            detProvider: "wasm",
            recProvider: "wasm",
          }),
          predict: async () => [
            ocrResult ?? {
              image: { width: 1, height: 1 },
              items: [],
              metrics: {},
              runtime: { requestedBackend: "wasm" },
            },
          ],
          dispose: async () => {
            if (disposed) return;
            await ocrCleanup?.();
            disposed = true;
            alive--;
            events.push("destroy:ocr");
          },
        } as any;
      },
    },
  });
  vi.spyOn(mgr.modelManager, "init").mockResolvedValue(undefined);
  vi.spyOn(mgr.modelManager, "get").mockImplementation((id) => ({
    manifest: CATALOG.find((m) => m.id === id)!,
    state: "installed",
    files: {},
  }));
  return {
    mgr,
    events,
    messages,
    peak: () => peak,
    alive: () => alive,
    hold: () => {
      holdChat = true;
    },
    finish: () => completeChat?.(),
    cleanup: (fn: () => Promise<void>) => {
      ocrCleanup = fn;
    },
  };
}

const targets = {
  asr: {
    modelRef: CATALOG.find(
      (m) => m.task === "asr" && m.backend.includes("wasm")
    )!.id,
    loadSpec: { device: "wasm" },
  },
  llm: { modelRef: "qwen2.5-0.5b", loadSpec: { device: "wasm" } },
  ocr: { modelRef: OCR_GROUPS[0].id, loadSpec: { device: "wasm" } },
  tts: {
    modelRef: CATALOG.find(
      (m) => m.task === "tts" && m.backend.includes("wasm")
    )!.id,
    loadSpec: { device: "wasm" },
  },
  decision: {
    modelRef: CATALOG.find(
      (m) => m.task === "decision" && m.backend.includes("wasm")
    )!.id,
    loadSpec: { device: "wasm" },
  },
};

describe("resource lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      storage: {
        local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects invalid input settings and merges independent limits", async () => {
    const s = setup();
    for (const value of [0, -1, 1.5, "10"]) {
      expect(await configure(s.mgr, { maxImageEdge: value })).toMatchObject({ ok: false, error: { code: "INVALID_SETTINGS" } });
    }
    await Promise.all([configure(s.mgr, { maxTtsCharacters: 4 }), configure(s.mgr, { mirror: "huggingface" })]);
    expect((await request(s.mgr, "runtime", "getSettings")).result).toMatchObject({ maxTtsCharacters: 4, mirror: "huggingface", maxImageEdge: 1536 });
    await configure(s.mgr, { autoUnloadMinutes: 0 });
  });

  it("enforces text and PCM limits on direct RPC calls and returns notices", async () => {
    const s = setup();
    await configure(s.mgr, { maxTtsCharacters: 3, maxAsrMinutes: 1 });
    const tts = await request(s.mgr, "tts", "synthesize", { ...targets.tts, text: "中😀ab", voice: "default", speed: 1 });
    expect(tts).toMatchObject({ ok: true, result: { inputAdjustments: [{ kind: "text", original: 4, processed: 3 }] } });
    expect(s.messages.find((m) => m.payload.type === "synthesize")?.payload.text).toBe("中😀a");
    const asr = await request(s.mgr, "asr", "transcribe", { ...targets.asr, audio: new Float32Array(61 * 16000) });
    expect(asr).toMatchObject({ ok: true, result: { inputAdjustments: [{ kind: "audio", processed: 60 }] } });
    expect(s.messages.find((m) => m.payload.type === "transcribe")?.payload.audio.length).toBe(60 * 16000);
    await configure(s.mgr, { autoUnloadMinutes: 0 });
  });

  it("rejects oversized OCR and VLM inputs before exclusive model switching", async () => {
    const s = setup();
    await configure(s.mgr, { exclusiveResourceMode: true, maxImageFileMB: 1 });
    await request(s.mgr, "llm", "load", targets.llm);
    const before = [...s.events];
    const blob = new Blob(); Object.defineProperty(blob, "size", { value: 1024 ** 2 + 1 });
    expect(await request(s.mgr, "ocr", "recognize", { ...targets.ocr, blob })).toMatchObject({ ok: false, error: { code: "INPUT_LIMIT_EXCEEDED" } });
    expect(await request(s.mgr, "llm", "chat", { ...targets.llm, messages: [{ role: "user", content: "", images: [new ArrayBuffer(1024 ** 2 + 1)] }], maxTokens: 4 })).toMatchObject({ ok: false, error: { code: "INPUT_LIMIT_EXCEEDED" } });
    expect(s.events).toEqual(before);
    await configure(s.mgr, { autoUnloadMinutes: 0 });
  });

  it.each(["cancel", "timeout"])("does not load or switch after %s during image decoding", async (mode) => {
    if (mode === "timeout") vi.useFakeTimers();
    const s = setup();
    await configure(s.mgr, { exclusiveResourceMode: true });
    await request(s.mgr, "llm", "load", targets.llm);
    const close = vi.fn();
    let complete: (v: any) => void = () => {};
    let entered: () => void = () => {};
    const decoding = new Promise<void>((resolve) => { entered = resolve; });
    vi.stubGlobal("createImageBitmap", vi.fn(() => {
      entered(); return new Promise((resolve) => { complete = resolve; });
    }));
    const before = [...s.events];
    const pending = s.mgr.handleRequest({ id: "cancel-image", service: "ocr", method: "recognize", deadlineMs: mode === "timeout" ? 5 : undefined, payload: { ...targets.ocr, blob: new Blob() } });
    await decoding;
    if (mode === "timeout") await vi.advanceTimersByTimeAsync(5);
    else s.mgr.cancelRequest("cancel-image");
    complete({ width: 1, height: 1, close });
    expect(await pending).toMatchObject({ ok: false, error: { code: mode === "timeout" ? "REQUEST_TIMEOUT" : "REQUEST_CANCELLED" } });
    expect(close).toHaveBeenCalledOnce();
    expect(s.events).toEqual(before);
    await configure(s.mgr, { autoUnloadMinutes: 0 });
  });

  it("scales OCR coordinates back to the original and sends resized PNG to VLM", async () => {
    const s = setup({ image: { width: 1536, height: 1024 },
      items: [{ text: "test", score: 1, poly: [[153.6, 102.4], [307.2, 204.8]] }],
      metrics: {}, runtime: { requestedBackend: "wasm" } });
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3000, height: 2000, close: vi.fn() })));
    const output = new Blob(["resized-png"], { type: "image/png" });
    vi.stubGlobal("OffscreenCanvas", class {
      width = 0; height = 0;
      getContext() { return { drawImage: vi.fn() }; }
      async convertToBlob() { return output; }
    });
    const progress: string[] = [];
    const ocr = await s.mgr.handleRequest({ id: "scaled-ocr", service: "ocr", method: "recognize", payload: { ...targets.ocr, blob: new Blob(["original"]) } },
      { onProgress: (p) => { if (p.status) progress.push(p.status); } });
    expect(ocr).toMatchObject({ ok: true, result: { width: 3000, height: 2000,
      items: [{ poly: [[300, 200], [600, 400]] }], inputAdjustments: [{ kind: "image" }] } });
    expect(progress.some((p) => p.includes("图片已等比例缩小"))).toBe(true);
    const vlm = await request(s.mgr, "llm", "chat", { ...targets.llm,
      messages: [{ role: "user", content: "read", images: [new ArrayBuffer(1)] }], maxTokens: 4 });
    expect(vlm).toMatchObject({ ok: true, result: { inputAdjustments: [{ kind: "image" }] } });
    const msg = s.messages.find((m) => m.payload.type === "chat")!.payload;
    expect(new TextDecoder().decode(msg.messages[0].images[0])).toBe("resized-png");
    await configure(s.mgr, { autoUnloadMinutes: 0 });
  });

  it("uses the received settings snapshot for a queued call", async () => {
    const s = setup();
    await configure(s.mgr, { maxTtsCharacters: 3 });
    s.hold();
    const chat = request(s.mgr, "llm", "chat", { ...targets.llm, messages: [], maxTokens: 4 });
    await vi.waitFor(() => expect(s.messages.some((m) => m.payload.type === "chat")).toBe(true));
    const tts = request(s.mgr, "tts", "synthesize", { ...targets.tts, text: "abcdef", voice: "default", speed: 1 });
    const update = configure(s.mgr, { maxTtsCharacters: 5 });
    await Promise.resolve();
    s.finish();
    await Promise.all([chat, tts, update]);
    expect(s.messages.find((m) => m.payload.type === "synthesize")!.payload.text).toBe("abc");
    await request(s.mgr, "tts", "synthesize", { ...targets.tts, text: "abcdef", voice: "default", speed: 1 });
    expect(s.messages.filter((m) => m.payload.type === "synthesize")[1].payload.text).toBe("abcde");
    await configure(s.mgr, { autoUnloadMinutes: 0 });
  });

  it("migrates settings and serially merges unrelated updates", async () => {
    expect(
      normalizeSettings({ mirror: "huggingface", autoUnloadModels: false })
    ).toMatchObject({ autoUnloadMinutes: 0, exclusiveResourceMode: false });
    expect(normalizeSettings({})).toMatchObject({ autoUnloadMinutes: 10 });
    const { mgr } = setup();
    await Promise.all([
      configure(mgr, { mirror: "huggingface" }),
      configure(mgr, { autoUnloadMinutes: 3 }),
    ]);
    expect((await request(mgr, "runtime", "getSettings")).result).toMatchObject(
      { mirror: "huggingface", autoUnloadMinutes: 3 }
    );
    for (const value of [-1, 1.5, NaN])
      expect(await configure(mgr, { autoUnloadMinutes: value })).toMatchObject({
        ok: false,
        error: { code: "INVALID_SETTINGS" },
      });
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(
      new Error("disk full")
    );
    expect(await configure(mgr, { autoUnloadMinutes: 0 })).toMatchObject({
      ok: false,
    });
    expect((await request(mgr, "runtime", "getSettings")).result).toMatchObject(
      { autoUnloadMinutes: 3 }
    );
  });

  it("concurrent pages keep one non-JEV instance, reuse a model, and restore only explicit targets", async () => {
    const s = setup();
    await configure(s.mgr, {
      exclusiveResourceMode: true,
      autoUnloadMinutes: 0,
    });
    expect(
      await request(s.mgr, "decision", "load", targets.decision)
    ).toMatchObject({ ok: true });
    const results = await Promise.all([
      request(s.mgr, "asr", "load", targets.asr),
      request(s.mgr, "llm", "chat", {
        ...targets.llm,
        messages: [],
        maxTokens: 4,
      }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(s.peak()).toBe(1);
    expect(s.mgr.getSessionState("decision").state).toBe("ready");
    expect(s.events.indexOf("destroy:asr")).toBeLessThan(
      s.events.indexOf("create:llm")
    );
    await request(s.mgr, "llm", "chat", {
      ...targets.llm,
      messages: [],
      maxTokens: 4,
    });
    expect(s.events.filter((e) => e === "create:llm")).toHaveLength(1);
    expect(
      await request(s.mgr, "asr", "transcribe", {
        ...targets.asr,
        audio: new Float32Array(1),
        language: "en",
      })
    ).toMatchObject({ ok: true });
    expect(
      await request(s.mgr, "llm", "chat", { messages: [], maxTokens: 4 })
    ).toMatchObject({ ok: false, error: { code: "MODEL_UNLOADED" } });
    expect(s.alive()).toBe(1);
  });

  it("waits for active inference before switching and refuses manual unload while busy", async () => {
    const s = setup();
    await configure(s.mgr, { exclusiveResourceMode: true });
    s.hold();
    const chat = request(s.mgr, "llm", "chat", {
      ...targets.llm,
      messages: [],
      maxTokens: 4,
    });
    await vi.waitFor(() =>
      expect(s.events.some((e) => e.startsWith("load:llm/"))).toBe(true)
    );
    const next = request(s.mgr, "asr", "load", targets.asr);
    expect(await request(s.mgr, "llm", "unload")).toMatchObject({
      ok: false,
      error: { code: "SERVICE_BUSY" },
    });
    expect(s.events).not.toContain("create:asr");
    s.finish();
    expect((await chat).ok).toBe(true);
    expect((await next).ok).toBe(true);
    expect(s.events.indexOf("chat:done")).toBeLessThan(
      s.events.indexOf("destroy:llm")
    );
    expect(s.peak()).toBe(1);
  });

  it("awaits OCR disposal, blocks new creation on cleanup failure, and validates before evicting", async () => {
    const s = setup();
    await configure(s.mgr, { exclusiveResourceMode: true });
    await request(s.mgr, "ocr", "load", targets.ocr);
    expect(
      await request(s.mgr, "asr", "load", {
        ...targets.asr,
        loadSpec: { dir: "wrong", device: "wasm" },
      })
    ).toMatchObject({ ok: false, error: { code: "INVALID_MODEL" } });
    expect(s.alive()).toBe(1);
    let release!: () => void;
    s.cleanup(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const next = request(s.mgr, "asr", "load", targets.asr);
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(s.events).not.toContain("create:asr");
    release();
    await next;
    expect(s.events.indexOf("destroy:ocr")).toBeLessThan(
      s.events.indexOf("create:asr")
    );
    await request(s.mgr, "ocr", "load", targets.ocr);
    s.cleanup(async () => {
      throw new Error("dispose failed");
    });
    const count = s.events.length;
    expect(await request(s.mgr, "llm", "load", targets.llm)).toMatchObject({
      ok: false,
    });
    expect(s.events.slice(count)).not.toContain("create:llm");
    expect(s.mgr.getSessionState("ocr").state).toBe("ready");
  });

  it.each(["asr", "ocr", "llm", "tts", "decision"] as const)(
    "automatically unloads %s after ten idle minutes",
    async (service) => {
      vi.useFakeTimers();
      const s = setup();
      expect(
        await request(s.mgr, service, "load", targets[service])
      ).toMatchObject({ ok: true });
      await vi.advanceTimersByTimeAsync(599_999);
      expect(s.mgr.getSessionState(service).modelId).not.toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(s.mgr.getSessionState(service)).toMatchObject({
        state: "unloaded",
        reason: "模型闲置超时，已自动卸载",
      });
    }
  );

  it("resets custom idle time, disables at zero, and protects a new session from old callbacks", async () => {
    vi.useFakeTimers();
    const s = setup();
    await request(s.mgr, "asr", "load", targets.asr);
    await vi.advanceTimersByTimeAsync(500_000);
    await configure(s.mgr, { autoUnloadMinutes: 2 });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(s.mgr.getSessionState("asr").modelId).not.toBeNull();
    await configure(s.mgr, { autoUnloadMinutes: 0 });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(s.mgr.getSessionState("asr").modelId).not.toBeNull();
    await configure(s.mgr, { autoUnloadMinutes: 1 });
    await request(s.mgr, "asr", "unload");
    await request(s.mgr, "asr", "load", targets.asr);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(s.mgr.getSessionState("asr").modelId).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.mgr.getSessionState("asr").state).toBe("unloaded");
  });

  it("a client retains broadcasts across unload and reload", async () => {
    const s = setup();
    const client = new AsrClient(new InPageRuntimeHost({ manager: s.mgr }));
    const model = CATALOG.find((m) => m.id === targets.asr.modelRef)!;
    const spec = {
      source: model.source,
      dir: model.dir,
      device: "wasm",
      dtype: "int8",
      multilingual: true,
      wordTimestamps: false,
    };
    await client.load(spec, targets.asr);
    await client.unload();
    await client.load(spec, targets.asr);
    expect(client.loaded).toBe(true);
    await request(s.mgr, "asr", "unload");
    expect(client.loaded).toBe(false);
  });

  it("enabling exclusive mode converges existing models, disabling does not reload them", async () => {
    const s = setup();
    await request(s.mgr, "asr", "load", targets.asr);
    await request(s.mgr, "ocr", "load", targets.ocr);
    expect(s.alive()).toBe(2);
    expect(
      await configure(s.mgr, { exclusiveResourceMode: true })
    ).toMatchObject({ ok: true });
    expect(s.alive()).toBe(1);
    expect(s.mgr.getSessionState("ocr").state).toBe("ready");
    await configure(s.mgr, { exclusiveResourceMode: false });
    expect(s.alive()).toBe(1);
    await request(s.mgr, "asr", "load", targets.asr);
    expect(s.alive()).toBe(2);
  });

  it("active and queued tasks prevent idle unload, then the shared LLM timer restarts", async () => {
    vi.useFakeTimers();
    const s = setup();
    await configure(s.mgr, { autoUnloadMinutes: 1 });
    await request(s.mgr, "llm", "load", targets.llm);
    await vi.advanceTimersByTimeAsync(59_000);
    s.hold();
    const chat = request(s.mgr, "llm", "chat", {
      ...targets.llm,
      messages: [],
      maxTokens: 4,
    });
    await vi.advanceTimersByTimeAsync(1);
    const waiting = request(s.mgr, "asr", "load", targets.asr);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(s.mgr.getSessionState("llm")).toMatchObject({
      state: "ready",
      busy: true,
    });
    expect(s.events).not.toContain("create:asr");
    s.finish();
    await chat;
    await waiting;
    await vi.advanceTimersByTimeAsync(59_999);
    expect(s.mgr.getSessionState("llm").modelId).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.mgr.getSessionState("llm").state).toBe("unloaded");
  });

  it("cancels during model validation without creating a worker", async () => {
    const s = setup();
    let finish!: () => void;
    vi.mocked(s.mgr.modelManager.init).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const pending = s.mgr.handleRequest({
      id: "cancel-before-enqueue",
      service: "asr",
      method: "load",
      payload: targets.asr,
    });
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(s.mgr.cancelRequest("cancel-before-enqueue")).toBe(true);
    finish();
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: "REQUEST_CANCELLED" },
    });
    expect(s.events).toEqual([]);
  });

  it("cancels queued explicit calls and times out active generation before switching", async () => {
    vi.useFakeTimers();
    const s = setup();
    await configure(s.mgr, { exclusiveResourceMode: true });
    s.hold();
    const active = s.mgr.handleRequest({
      id: "deadline-chat",
      service: "llm",
      method: "chat",
      deadlineMs: 100,
      payload: { ...targets.llm, messages: [], maxTokens: 4 },
    });
    await vi.advanceTimersByTimeAsync(1);
    const waiting = s.mgr.handleRequest({
      id: "cancel-queued",
      service: "asr",
      method: "load",
      payload: targets.asr,
    });
    await vi.advanceTimersByTimeAsync(1);
    s.mgr.cancelRequest("cancel-queued");
    expect(await waiting).toMatchObject({
      ok: false,
      error: { code: "REQUEST_CANCELLED" },
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(await active).toMatchObject({
      ok: false,
      error: { code: "REQUEST_TIMEOUT" },
    });
    expect(s.events).not.toContain("create:asr");
    expect((await request(s.mgr, "asr", "load", targets.asr)).ok).toBe(true);
    expect(s.peak()).toBe(1);
  });
});
