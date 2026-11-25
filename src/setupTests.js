import { ReadableStream, TransformStream, WritableStream } from "stream/web";
import { TextDecoder, TextEncoder } from "util";
import { Buffer } from "buffer";

Object.assign(globalThis, { ReadableStream, TransformStream, WritableStream });
globalThis.TextEncoder ||= class extends TextEncoder {
  encode(text) {
    return Uint8Array.from(super.encode(text));
  }
};
globalThis.TextDecoder ||= class extends TextDecoder {
  decode(input, options) {
    const bytes = ArrayBuffer.isView(input)
      ? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
      : input;
    return super.decode(bytes, options);
  }
};
if (!globalThis.DOMException && typeof AbortController === "function") {
  const abort = new AbortController();
  abort.abort();
  globalThis.DOMException = abort.signal.reason.constructor;
}
