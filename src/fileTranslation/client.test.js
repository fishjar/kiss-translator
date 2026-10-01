import { FileTranslationClient } from "./client";
import { FILE_CHANNEL, IMAGE_CHUNK_BYTES } from "./protocol";

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
