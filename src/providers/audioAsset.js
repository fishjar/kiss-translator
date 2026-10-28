import { providerError } from "./capabilities";

export function validateResponseAudio(options) {
  if (
    !options ||
    options.encoding !== "pcm_s16le" ||
    !Number.isInteger(options.sampleRate) ||
    options.sampleRate < 8000 ||
    options.sampleRate > 192000 ||
    !Number.isInteger(options.channels) ||
    options.channels < 1 ||
    options.channels > 8
  )
    throw providerError("INVALID_REQUEST", "Invalid PCM audio parameters.");
}

function isWav(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return (
    data.length >= 12 &&
    view.getUint32(0) === 0x52494646 &&
    view.getUint32(8) === 0x57415645
  );
}

function validateWav(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const invalid = () => {
    throw providerError("INVALID_RESPONSE", "Invalid WAV audio response.");
  };
  if (view.getUint32(4, true) + 8 !== data.length) invalid();
  let offset = 12,
    format,
    dataSize;
  while (offset < data.length) {
    if (offset + 8 > data.length) invalid();
    const id = view.getUint32(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end + (size % 2) > data.length) invalid();
    if (id === 0x666d7420) {
      if (format || size < 16) invalid();
      format = {
        encoding: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        rate: view.getUint32(start + 4, true),
        byteRate: view.getUint32(start + 8, true),
        align: view.getUint16(start + 12, true),
        bits: view.getUint16(start + 14, true),
      };
      if (
        !format.encoding ||
        !format.channels ||
        !format.rate ||
        !format.byteRate ||
        !format.align ||
        !format.bits
      )
        invalid();
      if (
        format.encoding === 1 &&
        (format.align !== (format.channels * format.bits) / 8 ||
          format.byteRate !== format.rate * format.align)
      )
        invalid();
    }
    if (id === 0x64617461) {
      if (dataSize !== undefined || !size) invalid();
      dataSize = size;
    }
    offset = end + (size % 2);
  }
  if (
    !format ||
    dataSize === undefined ||
    (format.encoding === 1 && dataSize % format.align !== 0)
  )
    invalid();
}

/** Validate before allocating the output Blob; includes the PCM WAV header. */
export function audioAssetSize(bytes, mimeType, options) {
  if (!options) return bytes.byteLength;
  validateResponseAudio(options);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  if (isWav(data)) {
    validateWav(data);
    return data.byteLength;
  }
  if (
    !["audio/pcm", "application/octet-stream"].includes(mime) ||
    !data.byteLength ||
    data.byteLength % (options.channels * 2) !== 0
  )
    throw providerError("INVALID_RESPONSE", "Invalid PCM audio response.");
  return data.byteLength + 44;
}

/** Wrap signed little-endian 16-bit PCM without changing its samples. */
export function audioAsset(bytes, mimeType, options) {
  audioAssetSize(bytes, mimeType, options);
  if (!options) return new Blob([bytes], { type: mimeType });
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (isWav(data)) return new Blob([data], { type: "audio/wav" });
  const header = new ArrayBuffer(44);
  const wav = new DataView(header);
  wav.setUint32(0, 0x52494646);
  wav.setUint32(4, data.byteLength + 36, true);
  wav.setUint32(8, 0x57415645);
  wav.setUint32(12, 0x666d7420);
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true);
  wav.setUint16(22, options.channels, true);
  wav.setUint32(24, options.sampleRate, true);
  wav.setUint32(28, options.sampleRate * options.channels * 2, true);
  wav.setUint16(32, options.channels * 2, true);
  wav.setUint16(34, 16, true);
  wav.setUint32(36, 0x64617461);
  wav.setUint32(40, data.byteLength, true);
  return new Blob([header, data], { type: "audio/wav" });
}
