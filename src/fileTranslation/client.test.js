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
    client.recognize(file, "ocr", new AbortController().signal)
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
function enableBridge({ client, target, respond }) {
  target.postMessage.mockImplementation((data) => {
    if (data.type === "discover") client.receive({
      source: target, origin: target.location.origin,
      data: { channel: FILE_CHANNEL, direction: "extension", type: "available",
        extensionId: "ext", bridgeId: "bridge" },
    });
    if (data.request?.method === "handshake") respond(data.request.requestId, {
      protocolVersion: FILE_PROTOCOL, extensionId: "ext", sessionId: "restored",
    });
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
    expect(events.at(-1).type).toBe("disconnected");
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(500);
    await flushPromises();
    expect(client.session?.sessionId).toBe("restored");
    expect(events.at(-1)).toMatchObject({ type: "connected", reconnecting: true });
    expect(target.postMessage.mock.calls.filter(([data]) => data.type === "discover")).toHaveLength(2);
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
