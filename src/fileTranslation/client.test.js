import { FileTranslationClient } from "./client";
import { FILE_CHANNEL, FILE_PROTOCOL, IMAGE_CHUNK_BYTES } from "./protocol";

let counter = 0;
beforeEach(() =>
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: { randomUUID: () => `request-${++counter}` },
  })
);
function setup() {
  const target = {
    location: { origin: "http://localhost:3000" },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    postMessage: jest.fn(),
  };
  const client = new FileTranslationClient(target);
  client.bridge = { extensionId: "ext", bridgeId: "bridge" };
  client.session = { sessionId: "session" };
  const respond = (requestId, result, extra = {}) =>
    client.receive({
      source: target,
      origin: target.location.origin,
      data: {
        channel: FILE_CHANNEL,
        direction: "extension",
        extensionId: "ext",
        bridgeId: "bridge",
        type: "response",
        requestId,
        result,
        ...extra,
      },
    });
  return { client, target, respond };
}

test("only the selected bridge can resolve a request; late responses are ignored", async () => {
  const { client, target, respond } = setup();
  const promise = client.request("translateText", { text: "hello" });
  const id = target.postMessage.mock.calls[0][0].request.requestId;
  respond(id, "wrong", { bridgeId: "other" });
  expect(client.pending.size).toBe(1);
  respond(id, "correct");
  await expect(promise).resolves.toBe("correct");
  respond(id, "late");
  expect(client.pending.size).toBe(0);
  client.dispose();
});

test("progress is bound to a pending request and its current session", async () => {
  const { client, target, respond } = setup();
  const onProgress = jest.fn();
  const promise = client.request("recognizeImage", {}, { onProgress });
  const id = target.postMessage.mock.calls[0][0].request.requestId;
  respond(id, null, { type: "progress", sessionId: "old", progress: { type: "inference" } });
  expect(onProgress).not.toHaveBeenCalled();
  respond(id, null, { type: "progress", sessionId: "session", progress: { type: "cache-hit" } });
  expect(onProgress).toHaveBeenCalledWith({ type: "cache-hit" });
  expect(client.pending.size).toBe(1);
  respond(id, { text: "cached" });
  await expect(promise).resolves.toEqual({ text: "cached" });
  respond(id, null, { type: "progress", sessionId: "session", progress: { type: "inference" } });
  expect(onProgress).toHaveBeenCalledTimes(1);
  client.dispose();
});

test("abort rejects locally and sends execution cancellation", async () => {
  const { client, target } = setup();
  const abort = new AbortController();
  const promise = client.request("translateText", {}, { signal: abort.signal });
  abort.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect(target.postMessage.mock.calls[1][0].request).toMatchObject({
    method: "cancel",
    sessionId: "session",
  });
  expect(client.pending.size).toBe(0);
  client.dispose();
});

test("disconnect rejects all requests and cleans listeners on disposal", async () => {
  const { client, target } = setup();
  const first = client.request("translateText");
  const second = client.request("getContext");
  client.dispose();
  await expect(first).rejects.toMatchObject({ code: "DISCONNECTED" });
  await expect(second).rejects.toMatchObject({ code: "DISCONNECTED" });
  expect(target.removeEventListener).toHaveBeenCalled();
});

test("image upload splits bytes, waits for acknowledgements, and releases uploads", async () => {
  const { client } = setup();
  const bytes = new Uint8Array(IMAGE_CHUNK_BYTES + 1).fill(65);
  const file = {
    size: bytes.length,
    type: "image/png",
    slice: (start, end) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }),
  };
  client.request = jest.fn(async (method) =>
    method === "uploadBegin"
      ? { uploadId: "image" }
      : method === "recognizeImage"
        ? { text: "A" }
        : null
  );
  await expect(
    client.recognize(file, { apiSlug: "ocr", capability: "recognizeText" }, new AbortController().signal)
  ).resolves.toEqual({ text: "A" });
  const chunks = client.request.mock.calls.filter(
    ([method]) => method === "uploadChunk"
  );
  expect(chunks.map(([, params]) => atob(params.data).length)).toEqual([
    IMAGE_CHUNK_BYTES,
    1,
  ]);
  expect(chunks.map(([, params]) => params.sequence)).toEqual([0, 1]);
  expect(client.request).toHaveBeenLastCalledWith(
    "cancel",
    { uploadId: "image" },
    { timeoutMs: 10000 }
  );
  client.dispose();
});

test("timeout sends cancellation and removes the pending request", async () => {
  jest.useFakeTimers();
  const { client, target } = setup();
  try {
    const request = client.request("translateText", {}, { timeoutMs: 10 });
    jest.advanceTimersByTime(10);
    await expect(request).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    expect(target.postMessage.mock.calls.at(-1)[0].request.method).toBe(
      "cancel"
    );
    expect(client.pending.size).toBe(0);
  } finally {
    client.dispose();
    jest.useRealTimers();
  }
});

test("multiple extension discoveries require an explicit selection", async () => {
  jest.useFakeTimers();
  const { client, target } = setup();
  client.session = null;
  target.postMessage.mockImplementation((data) => {
    if (data.type !== "discover") return;
    for (const extensionId of ["one", "two"])
      client.receive({
        source: target,
        origin: target.location.origin,
        data: {
          channel: FILE_CHANNEL,
          direction: "extension",
          type: "available",
          extensionId,
          bridgeId: extensionId,
        },
      });
  });
  try {
    const connection = client.connect();
    jest.advanceTimersByTime(500);
    await expect(connection).rejects.toMatchObject({
      code: "MULTIPLE_EXTENSIONS",
      extensions: ["one", "two"],
    });
    expect(client.session).toBeNull();
  } finally {
    client.dispose();
    jest.useRealTimers();
  }
});


const flushPromises = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test.each([true, false])("handshake timeout releases the bridge before %s automatic retry", async (automatic) => {
  jest.useFakeTimers();
  const fixture = setup(), { client, target } = fixture;
  client.session = null;
  let released = false;
  enableBridge(fixture);
  const healthyPost = target.postMessage.getMockImplementation();
  target.postMessage.mockImplementation((data) => {
    if (data.type === "disconnect") released = true;
    if (data.request?.method === "handshake" && !released) return;
    healthyPost(data);
  });
  try {
    const first = client.connect("ext").catch((error) => error);
    jest.advanceTimersByTime(500);
    await flushPromises();
    jest.advanceTimersByTime(10000);
    await flushPromises();
    expect(await first).toMatchObject({ code: "REQUEST_TIMEOUT" });
    expect(client.connecting).toBeNull();
    expect(released).toBe(true);
    expect(client.reconnectAt).toBe(Date.now() + 1000);
    if (automatic) {
      jest.advanceTimersByTime(1000);
    } else {
      client.connect("ext");
    }
    jest.advanceTimersByTime(500);
    await flushPromises();
    expect(client.session?.sessionId).toBe("restored");
    expect(client.reconnectAt).toBeNull();
    expect(client.pending.size).toBe(0);
  } finally { client.dispose(); jest.useRealTimers(); }
});
function enableBridge({ client, target, respond }, ids = ["ext"], protocolVersion = FILE_PROTOCOL) {
  target.postMessage.mockImplementation((data) => {
    if (data.type === "discover") ids.forEach((extensionId) => client.receive({
      source: target, origin: target.location.origin,
      data: { channel: FILE_CHANNEL, direction: "extension", type: "available",
        extensionId, bridgeId: "bridge" },
    }));
    if (data.request?.method === "handshake") respond(data.request.requestId, {
      protocolVersion, extensionId: data.extensionId, sessionId: "restored",
    }, { extensionId: data.extensionId });
  });
}

test("heartbeat timeout reconnects to the same extension and restores the session", async () => {
  jest.useFakeTimers();
  const fixture = setup(), { client, target } = fixture;
  const events = [];
  client.subscribe((event) => events.push(event));
  client.session = null;
  enableBridge(fixture);
  try {
    const connection = client.connect("ext");
    jest.advanceTimersByTime(500);
    await connection;
    jest.advanceTimersByTime(20000);
    jest.advanceTimersByTime(10000);
    await flushPromises();
    expect(client.session).toBeNull();
    expect(events.at(-2).type).toBe("disconnected");
    expect(events.at(-1)).toMatchObject({ type: "reconnectScheduled", reconnectAt: Date.now() + 1000 });
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(500);
    await flushPromises();
    expect(client.session?.sessionId).toBe("restored");
    expect(events.at(-1)).toMatchObject({ type: "connected", reconnecting: true });
    expect(target.postMessage.mock.calls.filter(([data]) => data.type === "discover")).toHaveLength(2);
  } finally { client.dispose(); jest.useRealTimers(); }
});

test("an initially missing extension is discovered on automatic retry", async () => {
  jest.useFakeTimers();
  const fixture = setup(), { client } = fixture;
  client.session = null;
  const events = [];
  client.subscribe((event) => events.push(event));
  try {
    const first = client.connect().catch((error) => error);
    jest.advanceTimersByTime(500);
    expect(await first).toMatchObject({ code: "EXTENSION_MISSING" });
    expect(client.reconnectTimer).toBeTruthy();
    enableBridge(fixture);
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(500);
    await flushPromises();
    expect(client.session?.sessionId).toBe("restored");
    expect(events.at(-1)).toMatchObject({ type: "connected", reconnecting: true });
    expect(client.reconnectAttempts).toBe(0);
  } finally { client.dispose(); jest.useRealTimers(); }
});

test.each([
  ["ext", ["ext", "other"], "ext"],
  ["old", ["new"], "new"],
])("recovery prefers %s or adopts the only replacement", async (previous, ids, expected) => {
  jest.useFakeTimers();
  const fixture = setup(), { client } = fixture;
  client.reconnectEnabled = true;
  client.reconnectExtensionId = previous;
  enableBridge(fixture, ids);
  try {
    client.disconnect(new Error("lost"), true);
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(500);
    await flushPromises();
    expect(client.session.extensionId).toBe(expected);
  } finally { client.dispose(); jest.useRealTimers(); }
});

test.each([
  [["one", "two"], FILE_PROTOCOL, "MULTIPLE_EXTENSIONS"],
  [["ext"], FILE_PROTOCOL + 1, "INCOMPATIBLE_PROTOCOL"],
])("recovery stops for a user decision or incompatible protocol", async (ids, protocol, code) => {
  jest.useFakeTimers();
  const fixture = setup(), { client, target } = fixture;
  client.reconnectEnabled = true;
  client.reconnectExtensionId = "missing";
  const events = [];
  client.subscribe((event) => events.push(event));
  enableBridge(fixture, ids, protocol);
  try {
    client.disconnect(new Error("lost"), true);
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(500);
    await flushPromises();
    expect(events.at(-1)).toMatchObject({ type: "reconnectFailed", error: { code } });
    expect(client.reconnectEnabled).toBe(false);
    jest.advanceTimersByTime(60000);
    expect(target.postMessage.mock.calls.filter(([data]) => data.type === "discover")).toHaveLength(1);
    expect(events.at(-1).error.extensions).toEqual(code === "MULTIPLE_EXTENSIONS" ? ids : undefined);
  } finally { client.dispose(); jest.useRealTimers(); }
});

test("manual attempts bypass backoff and share a single handshake", async () => {
  jest.useFakeTimers();
  const fixture = setup(), { client, target } = fixture;
  client.session = null;
  try {
    const first = client.connect().catch((error) => error);
    jest.advanceTimersByTime(500);
    expect(await first).toMatchObject({ code: "EXTENSION_MISSING" });
    enableBridge(fixture);
    const manual = client.connect();
    const duplicate = client.connect();
    expect(client.reconnectTimer).toBeNull();
    jest.advanceTimersByTime(500);
    await Promise.all([manual, duplicate]);
    expect(target.postMessage.mock.calls.filter(([data]) => data.request?.method === "handshake")).toHaveLength(1);
  } finally { client.dispose(); jest.useRealTimers(); }
});

test.each(["discovery", "handshake"])("disconnect cancels %s and permits a fresh connection", async (phase) => {
  jest.useFakeTimers();
  const fixture = setup(), { client, target, respond } = fixture;
  client.session = null;
  enableBridge(fixture);
  if (phase === "handshake") {
    const discover = target.postMessage.getMockImplementation();
    target.postMessage.mockImplementation((data) => {
      if (data.type === "discover") discover(data);
    });
  }
  try {
    const old = client.connect().catch((error) => error);
    if (phase === "handshake") {
      jest.advanceTimersByTime(500);
      await flushPromises();
    }
    const request = target.postMessage.mock.calls.find(([data]) => data.request?.method === "handshake")?.[0].request;
    client.disconnect();
    enableBridge(fixture);
    const fresh = client.connect();
    if (request) respond(request.requestId, { protocolVersion: FILE_PROTOCOL, extensionId: "ext", sessionId: "stale" });
    expect(await old).toMatchObject({ code: "DISCONNECTED" });
    jest.advanceTimersByTime(500);
    await fresh;
    expect(client.session.sessionId).toBe("restored");
    expect(client.reconnectTimer).toBeNull();
  } finally { client.dispose(); jest.useRealTimers(); }
});

test("failed reconnects back off and disposal stops further attempts", async () => {
  jest.useFakeTimers();
  const { client } = setup();
  client.reconnectEnabled = true;
  client.reconnectExtensionId = "ext";
  const connect = jest.spyOn(client, "connect").mockRejectedValue(new Error("missing"));
  try {
    client.disconnect(new Error("lost"), true);
    jest.advanceTimersByTime(1000); await flushPromises();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith("ext", { reconnecting: true });
    jest.advanceTimersByTime(1999); await flushPromises();
    expect(connect).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1); await flushPromises();
    expect(connect).toHaveBeenCalledTimes(2);
    client.dispose();
    jest.advanceTimersByTime(60000); await flushPromises();
    expect(connect).toHaveBeenCalledTimes(2);
  } finally { client.dispose(); jest.useRealTimers(); }
});

test("a port disconnect schedules recovery, but intentional disconnect cancels it", async () => {
  jest.useFakeTimers();
  const { client, target } = setup();
  client.reconnectEnabled = true;
  const connect = jest.spyOn(client, "connect");
  try {
    client.receive({ source: target, origin: target.location.origin,
      data: { channel: FILE_CHANNEL, direction: "extension", extensionId: "ext",
        bridgeId: "bridge", type: "disconnected" } });
    expect(client.reconnectTimer).toBeTruthy();
    client.disconnect();
    jest.advanceTimersByTime(60000); await flushPromises();
    expect(connect).not.toHaveBeenCalled();
  } finally { client.dispose(); jest.useRealTimers(); }
});

test("automatic recovery rejects interrupted translations without replaying them", async () => {
  jest.useFakeTimers();
  const fixture = setup(), { client, target } = fixture;
  client.reconnectEnabled = true;
  client.reconnectExtensionId = "ext";
  const interrupted = client.request("translateText", { text: "once" }).catch((error) => error);
  enableBridge(fixture);
  try {
    client.disconnect(new Error("lost"), true);
    expect(await interrupted).toMatchObject({ message: "lost" });
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(500);
    await flushPromises();
    expect(client.session.sessionId).toBe("restored");
    expect(target.postMessage.mock.calls.filter(([data]) => data.request?.method === "translateText")).toHaveLength(1);
  } finally { client.dispose(); jest.useRealTimers(); }
});

test("disposal cancels initial discovery and does not enable retries", async () => {
  jest.useFakeTimers();
  const { client, target } = setup();
  client.session = null;
  try {
    const connecting = client.connect().catch((error) => error);
    client.dispose();
    expect(await connecting).toMatchObject({ code: "DISCONNECTED" });
    jest.advanceTimersByTime(60000);
    expect(target.postMessage.mock.calls.filter(([data]) => data.type === "discover")).toHaveLength(1);
    expect(client.reconnectTimer).toBeNull();
  } finally { client.dispose(); jest.useRealTimers(); }
});

test("retries cap their delay at thirty seconds", async () => {
  jest.useFakeTimers();
  const { client } = setup();
  client.reconnectEnabled = true;
  const connect = jest.spyOn(client, "connect").mockRejectedValue(new Error("missing"));
  try {
    client.disconnect(new Error("lost"), true);
    for (const [index, delay] of [1000, 2000, 4000, 8000, 16000, 30000, 30000].entries()) {
      jest.advanceTimersByTime(delay - 1);
      expect(connect).toHaveBeenCalledTimes(index);
      jest.advanceTimersByTime(1);
      await flushPromises();
      expect(connect).toHaveBeenCalledTimes(index + 1);
    }
  } finally { client.dispose(); jest.useRealTimers(); }
});
