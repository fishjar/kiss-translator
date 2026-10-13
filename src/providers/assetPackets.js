import { providerError } from "./capabilities";

// Each packet is 64 KiB of bytes. Total assets are bounded before IPC allocation.
const MAX_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
/** Encode one slice at a time; backpressure must arrive before allocating the next slice. */
export async function* assetMessages(store, ids) {
  const entries = store.entries().filter(([id]) => !ids || ids.includes(id));
  if (
    entries.length > 8 ||
    entries.reduce((n, [, blob]) => n + blob.size, 0) > MAX_BYTES
  )
    throw providerError(
      "INPUT_LIMIT_EXCEEDED",
      "Assets exceed 8 files or 8 MiB."
    );
  for (const [assetId, blob] of entries) {
    const ref = {
      assetId,
      mimeType: blob.type || "application/octet-stream",
      ...(blob.name && { filename: blob.name }),
    };
    yield { type: "asset.begin", ref, size: blob.size };
    let index = 0;
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const bytes = new Uint8Array(
        await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer()
      );
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      yield {
        type: "asset.chunk",
        assetId,
        index: index++,
        data: btoa(binary),
      };
    }
    yield { type: "asset.end", assetId };
  }
}

/** Import only completed assets. A malformed/incomplete stream never becomes an executable input. */
export function createAssetReceiver(store) {
  let current;
  let count = 0;
  let total = 0;
  return {
    receive(message) {
      if (message.type === "asset.begin") {
        if (
          current ||
          ++count > 8 ||
          !Number.isInteger(message.size) ||
          message.size < 0 ||
          (total += message.size) > MAX_BYTES
        )
          throw providerError(
            "INVALID_ASSET",
            "Invalid asset transfer size or order."
          );
        // Reuse reference validation without allocating the advertised payload.
        decodeAssets([{ ref: message.ref, size: 0, chunks: [] }], {
          import() {},
        });
        current = {
          ref: message.ref,
          size: message.size,
          chunks: [],
          length: 0,
        };
      } else if (message.type === "asset.chunk") {
        if (
          !current ||
          message.assetId !== current.ref.assetId ||
          message.index !== current.chunks.length ||
          typeof message.data !== "string" ||
          message.data.length > Math.ceil(CHUNK_BYTES / 3) * 4
        )
          throw providerError(
            "INVALID_ASSET",
            "Invalid asset chunk order or size."
          );
        const binary = atob(message.data);
        if (
          binary.length !==
            Math.min(CHUNK_BYTES, current.size - current.length) ||
          !binary.length ||
          (current.length += binary.length) > current.size
        )
          throw providerError(
            "INVALID_ASSET",
            "Asset chunk exceeds declared size."
          );
        current.chunks.push(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
      } else if (message.type === "asset.end") {
        if (
          !current ||
          message.assetId !== current.ref.assetId ||
          current.length !== current.size
        )
          throw providerError("INVALID_ASSET", "Incomplete asset transfer.");
        store.import(
          current.ref,
          new Blob(current.chunks, { type: current.ref.mimeType })
        );
        current = undefined;
      } else throw providerError("INVALID_ASSET", "Unknown asset message.");
    },
    finish() {
      if (current)
        throw providerError("INVALID_ASSET", "Incomplete asset transfer.");
    },
    clear() {
      current = undefined;
    },
  };
}

/** One unacknowledged message per transfer. Disconnect/abort rejects the pending wait. */
export function createAssetSender(port, signal) {
  let pending;
  let sequence = 0;
  const fail = () => {
    pending?.reject(
      providerError("HOST_CLOSED", "Asset transfer disconnected or cancelled.")
    );
    pending = undefined;
  };
  const onMessage = (message) => {
    if (message.type === "asset.ack" && message.transferId === pending?.id) {
      pending.resolve();
      pending = undefined;
    }
  };
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(fail);
  signal?.addEventListener("abort", fail, { once: true });
  const sendMessage = (message) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending = { id, resolve, reject };
      try {
        port.postMessage({ ...message, transferId: id });
      } catch (error) {
        pending = undefined;
        reject(error);
      }
    });
  return {
    async send(store, ids) {
      for await (const message of assetMessages(store, ids)) {
        if (signal?.aborted) throw signal.reason;
        await sendMessage(message);
      }
    },
    dispose() {
      fail();
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(fail);
      signal?.removeEventListener("abort", fail);
    },
  };
}
export async function encodeAssets(store, ids) {
  const entries = store.entries().filter(([id]) => !ids || ids.includes(id));
  if (entries.length > 8)
    throw providerError("INPUT_LIMIT_EXCEEDED", "Assets exceed 8 files.");
  if (entries.reduce((total, [, blob]) => total + blob.size, 0) > MAX_BYTES)
    throw providerError("INPUT_LIMIT_EXCEEDED", "Assets exceed 8 MiB.");
  const packets = [];
  for (const [assetId, blob] of entries) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      let binary = "";
      for (const byte of bytes.subarray(offset, offset + CHUNK_BYTES))
        binary += String.fromCharCode(byte);
      chunks.push(btoa(binary));
    }
    packets.push({
      ref: {
        assetId,
        mimeType: blob.type || "application/octet-stream",
        ...(blob.name && { filename: blob.name }),
      },
      size: bytes.length,
      chunks,
    });
  }
  return packets;
}

export function decodeAssets(packets, store) {
  if (!Array.isArray(packets) || packets.length > 8)
    throw providerError("INVALID_ASSET", "Invalid asset packet list.");
  let total = 0;
  for (const packet of packets) {
    if (
      !packet ||
      !packet.ref ||
      typeof packet.ref.mimeType !== "string" ||
      !/^asset-\d+$/.test(packet.ref.assetId)
    )
      throw providerError("INVALID_ASSET", "Invalid asset reference.");
    if (
      !Number.isInteger(packet.size) ||
      packet.size < 0 ||
      (total += packet.size) > MAX_BYTES ||
      !Array.isArray(packet.chunks) ||
      packet.chunks.length > MAX_BYTES / CHUNK_BYTES
    )
      throw providerError("INPUT_LIMIT_EXCEEDED", "Invalid asset size.");
    let length = 0;
    const chunks = packet.chunks.map((encoded) => {
      if (
        typeof encoded !== "string" ||
        encoded.length > Math.ceil(CHUNK_BYTES / 3) * 4
      )
        throw providerError("INVALID_ASSET", "Invalid asset chunk.");
      const binary = atob(encoded);
      length += binary.length;
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    });
    if (length !== packet.size)
      throw providerError("INVALID_ASSET", "Asset size mismatch.");
    store.import(packet.ref, new Blob(chunks, { type: packet.ref.mimeType }));
  }
}
