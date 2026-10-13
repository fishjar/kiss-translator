import { Blob as NodeBlob } from "buffer";
import {
  encodeAssets,
  decodeAssets,
  assetMessages,
  createAssetReceiver,
  createAssetSender,
} from "./assetPackets";
import { createAssetStore } from "./transport";

test("binary task assets round-trip through JSON IPC without changing bytes", async () => {
  const originalBlob = global.Blob;
  global.Blob = NodeBlob;
  try {
    const bytes = Uint8Array.from({ length: 70000 }, (_, index) => index % 256);
    const source = createAssetStore();
    const ref = source.put(new NodeBlob([bytes], { type: "audio/wav" }));
    const packets = await encodeAssets(source);
    expect(packets[0].chunks).toHaveLength(2);
    const destination = createAssetStore();
    decodeAssets(JSON.parse(JSON.stringify(packets)), destination);
    expect(new Uint8Array(await destination.get(ref).arrayBuffer())).toEqual(
      bytes
    );
    expect(destination.put(new NodeBlob([])).assetId).toBe("asset-2");
    expect(() => decodeAssets(packets, destination)).toThrow("duplicate");
  } finally {
    global.Blob = originalBlob;
  }
});

test("asset packets reject missing references, mismatched sizes and allocation limits", async () => {
  expect(() =>
    decodeAssets([{ size: 0, chunks: [] }], createAssetStore())
  ).toThrow("reference");
  expect(() =>
    decodeAssets(
      [{ ref: { assetId: "asset-1", mimeType: "x" }, size: 1, chunks: [] }],
      createAssetStore()
    )
  ).toThrow("mismatch");
  const source = createAssetStore();
  for (let index = 0; index < 9; index++) source.put(new NodeBlob([]));
  await expect(encodeAssets(source)).rejects.toThrow("8 files");
});

test("chunked transfer imports only after end and preserves bytes across 64 KiB boundaries", async () => {
  const previous = global.Blob;
  global.Blob = NodeBlob;
  try {
    const source = createAssetStore();
    const bytes = Uint8Array.from({ length: 131073 }, (_, i) => i % 251);
    const ref = source.put(new NodeBlob([bytes], { type: "audio/wav" }));
    const target = createAssetStore();
    const receiver = createAssetReceiver(target);
    const messages = [];
    for await (const message of assetMessages(source)) {
      messages.push(message);
      receiver.receive(JSON.parse(JSON.stringify(message)));
      if (message.type !== "asset.end")
        expect(target.entries()).toHaveLength(0);
    }
    receiver.finish();
    expect(messages.map((m) => m.type)).toEqual([
      "asset.begin",
      "asset.chunk",
      "asset.chunk",
      "asset.chunk",
      "asset.end",
    ]);
    expect(new Uint8Array(await target.get(ref).arrayBuffer())).toEqual(bytes);
    const incomplete = createAssetReceiver(createAssetStore());
    incomplete.receive(messages[0]);
    expect(() => incomplete.finish()).toThrow("Incomplete");
    expect(() => incomplete.receive({ ...messages[1], index: 1 })).toThrow(
      "order"
    );
  } finally {
    global.Blob = previous;
  }
});

test("sender never reads next slice before acknowledgement and cancellation rejects the wait", async () => {
  const listeners = new Set();
  const disconnected = new Set();
  const messages = [];
  const port = {
    onMessage: {
      addListener: (f) => listeners.add(f),
      removeListener: (f) => listeners.delete(f),
    },
    onDisconnect: {
      addListener: (f) => disconnected.add(f),
      removeListener: (f) => disconnected.delete(f),
    },
    postMessage: (m) => messages.push(m),
  };
  const source = createAssetStore();
  const blob = new NodeBlob([new Uint8Array(70000)]);
  const slice = jest.spyOn(blob, "slice");
  source.put(blob);
  const controller = new AbortController();
  const sender = createAssetSender(port, controller.signal);
  const sending = sender.send(source);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(messages).toHaveLength(1);
  expect(slice).not.toHaveBeenCalled();
  for (const listener of listeners)
    listener({ type: "asset.ack", transferId: messages[0].transferId });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(messages).toHaveLength(2);
  expect(slice).toHaveBeenCalledTimes(1);
  controller.abort();
  await expect(sending).rejects.toMatchObject({ code: "HOST_CLOSED" });
  sender.dispose();
  expect(listeners.size).toBe(0);
  expect(disconnected.size).toBe(0);
});
