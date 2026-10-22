import { UmpReader, CompositeBuffer } from "googlevideo/ump";
import {
  FormatId,
  FormatInitializationMetadata,
  MediaHeader,
  StreamProtectionStatus,
  NextRequestPolicy,
  StreamerContext,
  SabrContextUpdate,
  SabrContextSendingPolicy,
} from "googlevideo/protos";

const fail = (code) => Object.assign(new Error(code), { code });
export const SABR_BODY_LIMIT = 65536;
export const SABR_RESPONSE_LIMIT = 8 * 1024 * 1024;
export function joinBytes(parts) {
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
export function protoInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw fail("INVALID_SABR_BODY");
  const bytes = [];
  do {
    const byte = value % 128;
    value = Math.floor(value / 128);
    bytes.push(byte + (value ? 128 : 0));
  } while (value);
  return new Uint8Array(bytes);
}
export function protoFields(bytes) {
  let offset = 0;
  const integer = () => {
    let value = 0;
    for (let i = 0; i < 8; i++) {
      if (offset >= bytes.length) throw fail("INVALID_SABR_BODY");
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** (i * 7);
      if (!Number.isSafeInteger(value)) throw fail("INVALID_SABR_BODY");
      if (!(byte & 128)) return value;
    }
    throw fail("INVALID_SABR_BODY");
  };
  const result = [];
  while (offset < bytes.length) {
    const start = offset,
      tag = integer(),
      wire = tag & 7;
    if (!(tag >>> 3)) throw fail("INVALID_SABR_BODY");
    let payload = offset;
    if (wire === 0) {
      let complete = false;
      for (let i = 0; i < 10; i++) {
        if (offset >= bytes.length) break;
        const byte = bytes[offset++];
        if (i === 9 && byte > 1) throw fail("INVALID_SABR_BODY");
        if (!(byte & 128)) {
          complete = true;
          break;
        }
      }
      if (!complete) throw fail("INVALID_SABR_BODY");
    } else if (wire === 2) {
      const size = integer();
      payload = offset;
      offset += size;
    } else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else throw fail("INVALID_SABR_BODY");
    if (offset > bytes.length) throw fail("INVALID_SABR_BODY");
    result.push({
      number: tag >>> 3,
      wire,
      raw: bytes.slice(start, offset),
      value: bytes.slice(payload, offset),
    });
  }
  return result;
}
export function protoField(number, wire, value) {
  return joinBytes([
    protoInteger(number * 8 + wire),
    ...(wire === 2 ? [protoInteger(value.length)] : []),
    value,
  ]);
}
export const replaceProto = (bytes, number, wire, value) =>
  joinBytes([
    ...protoFields(bytes)
      .filter((field) => field.number !== number)
      .map((field) => field.raw),
    protoField(number, wire, value),
  ]);
export function sabrUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.endsWith(".googlevideo.com") &&
      url.pathname === "/videoplayback"
      ? url
      : null;
  } catch {
    return null;
  }
}
export const formatKey = (format) =>
  JSON.stringify([
    format?.itag,
    String(format?.lastModified || ""),
    format?.xtags || "",
  ]);
export const headerFormat = (header) =>
  header.formatId || {
    itag: header.itag,
    lastModified: header.lmt,
    xtags: header.xtags,
  };

export function readUmp(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > SABR_RESPONSE_LIMIT)
    throw fail("AUDIO_RESPONSE_TOO_LARGE");
  const reader = new UmpReader(new CompositeBuffer([bytes])),
    parts = [];
  const partial = reader.read((part) =>
    parts.push({ type: part.type, data: joinBytes(part.data.chunks) })
  );
  if (partial || reader.compositeBuffer.getLength())
    throw fail("INCOMPLETE_UMP");
  return parts;
}

/** Resolve actual native audio from response headers, never from a first-track guess. */
export function nativeAudioFormat(body, response, videoId, knownFormats = []) {
  if (!body.length || body.length > SABR_BODY_LIMIT)
    throw fail("INVALID_SABR_BODY");
  const fields = protoFields(body);
  if (
    ![1, 19].every((number) =>
      fields.some((field) => field.number === number && field.wire === 2)
    )
  )
    throw fail("INVALID_SABR_BODY");
  const declared = fields
    .filter((field) => field.number === 16 && field.wire === 2)
    .map((field) => FormatId.decode(field.value));
  const parts = readUmp(response);
  const audio = parts
    .filter((part) => part.type === 42)
    .map((part) => FormatInitializationMetadata.decode(part.data))
    .filter(
      (meta) =>
        meta.videoId === videoId &&
        meta.mimeType?.startsWith("audio/") &&
        meta.formatId
    );
  const confirmed = new Map();
  for (const part of parts)
    if (part.type === 20) {
      const header = MediaHeader.decode(part.data),
        format = headerFormat(header),
        key = formatKey(format);
      if (
        header.videoId === videoId &&
        !header.isInitSeg &&
        (audio.some((meta) => formatKey(meta.formatId) === key) ||
          knownFormats.some(
            (entry) =>
              entry.mimeType?.startsWith("audio/") && formatKey(entry) === key
          )) &&
        (!declared.length || declared.some((entry) => formatKey(entry) === key))
      )
        confirmed.set(key, format);
    }
  if (confirmed.size !== 1) throw fail("NATIVE_AUDIO_NOT_CONFIRMED");
  return [...confirmed.values()][0];
}

// Single-track videos can omit audioTrack on every format, including DRC variants.
export function youtubeAudioFormats(playerResponse) {
  const formats = playerResponse?.streamingData?.adaptiveFormats || [];
  const audio = formats.filter((entry) => entry.mimeType?.startsWith("audio/"));
  if (!audio.length || audio.some((entry) => entry.audioTrack?.id))
    return formats;
  return formats.map((entry) =>
    entry.mimeType?.startsWith("audio/")
      ? { ...entry, audioTrack: { id: "default" } }
      : entry
  );
}

export function selectedAacFormat(playerResponse, nativeFormat, videoId) {
  if (
    playerResponse?.videoDetails?.videoId !== videoId ||
    playerResponse.videoDetails.isLiveContent
  )
    throw fail("UNSUPPORTED_VIDEO");
  const formats = youtubeAudioFormats(playerResponse);
  const native = formats.find(
    (entry) => formatKey(entry) === formatKey(nativeFormat)
  );
  if (!native?.audioTrack?.id) throw fail("AUDIO_IDENTITY_MISSING");
  const candidates = formats.filter(
    (entry) =>
      entry.mimeType?.startsWith("audio/mp4") &&
      entry.audioTrack?.id === native.audioTrack.id &&
      String(entry.xtags || "") === String(native.xtags || "")
  );
  if (candidates.length !== 1) throw fail("AAC_TRACK_UNAVAILABLE");
  return candidates[0];
}

/** Ephemeral page-world state. Unknown fields and original auth bytes are preserved. */
export class SabrAudioSession {
  constructor({ body, format, videoId }) {
    this.videoId = videoId;
    this.format = format;
    this.body = replaceProto(body, 16, 2, FormatId.encode(format).finish());
    this.body = joinBytes(
      protoFields(this.body)
        .filter((field) => ![2, 3, 17].includes(field.number))
        .map((field) => field.raw)
    );
    const context = protoFields(this.body).find(
      (field) => field.number === 19
    )?.value;
    if (!context) throw fail("INVALID_SABR_BODY");
    const decoded = StreamerContext.decode(context);
    this.contexts = new Map(
      decoded.sabrContexts.map((entry) => [entry.type, entry])
    );
    this.active = new Set(this.contexts.keys());
    this.unsent = new Set(decoded.unsentSabrContexts);
    this.started = Date.now();
    this.protection = 0;
    this.backoffMs = 0;
  }
  request(positionMs) {
    if (!Number.isSafeInteger(positionMs) || positionMs < 0)
      throw fail("INVALID_AUDIO_RANGE");
    let state = protoFields(this.body).find(
      (field) => field.number === 1
    )?.value;
    if (!state) throw fail("INVALID_SABR_BODY");
    state = replaceProto(state, 28, 0, protoInteger(positionMs));
    state = replaceProto(state, 40, 0, protoInteger(1));
    state = replaceProto(state, 35, 5, new Uint8Array([0, 0, 128, 63]));
    this.body = replaceProto(this.body, 1, 2, state);
    this.body = replaceProto(this.body, 4, 0, protoInteger(positionMs));
    return this.body.slice();
  }
  consume(bytes) {
    const parts = readUmp(bytes),
      pending = new Map(),
      segments = [];
    for (const part of parts) {
      if (part.type === 58)
        this.protection = StreamProtectionStatus.decode(part.data).status;
      else if (part.type === 42) {
        const meta = FormatInitializationMetadata.decode(part.data);
        if (
          meta.videoId === this.videoId &&
          formatKey(meta.formatId) === formatKey(this.format)
        ) {
          if (!meta.mimeType?.startsWith("audio/mp4"))
            throw fail("UNSUPPORTED_AUDIO_CODEC");
          this.expectedSegments = Number(meta.endSegmentNumber);
          this.expectedEndMs =
            (Number(meta.durationUnits) * 1000) /
            Number(meta.durationTimescale || 1000);
        }
      } else if (part.type === 35) {
        this.backoffMs = Math.max(
          0,
          NextRequestPolicy.decode(part.data).backoffTimeMs || 0
        );
        this.cookie =
          protoFields(part.data).find(
            (field) => field.number === 7 && field.wire === 2
          )?.value || this.cookie;
      } else if (part.type === 57) {
        const update = SabrContextUpdate.decode(part.data);
        if (
          Number.isInteger(update.type) &&
          update.value &&
          (update.writePolicy !== 2 || !this.contexts.has(update.type))
        )
          this.contexts.set(update.type, {
            type: update.type,
            value: update.value,
          });
        if (update.sendByDefault) this.active.add(update.type);
      } else if (part.type === 59) {
        const policy = SabrContextSendingPolicy.decode(part.data);
        policy.startPolicy.forEach((type) => this.active.add(type));
        policy.stopPolicy.forEach((type) => this.active.delete(type));
        policy.discardPolicy.forEach((type) => {
          this.active.delete(type);
          this.contexts.delete(type);
          this.unsent.delete(type);
        });
      } else if (part.type === 20) {
        const header = MediaHeader.decode(part.data);
        if (
          header.videoId !== this.videoId ||
          formatKey(headerFormat(header)) !== formatKey(this.format)
        )
          continue;
        if (header.compressionAlgorithm)
          throw fail("COMPRESSED_AUDIO_UNSUPPORTED");
        if (
          !Number.isInteger(header.headerId) ||
          header.headerId < 0 ||
          header.headerId > 255 ||
          pending.has(header.headerId)
        )
          throw fail("INVALID_MEDIA_HEADER");
        pending.set(header.headerId, {
          index: header.isInitSeg ? 0 : Number(header.sequenceNumber),
          startMs: Number(header.startMs || 0),
          endMs: Number(header.startMs || 0) + Number(header.durationMs || 0),
          expected: Number(header.contentLength || 0),
          chunks: [],
          bytes: 0,
        });
      } else if (part.type === 21 && part.data.length) {
        const entry = pending.get(part.data[0]);
        if (entry) {
          const chunk = part.data.slice(1);
          entry.chunks.push(chunk);
          entry.bytes += chunk.length;
        }
      } else if (part.type === 22 && part.data.length) {
        const entry = pending.get(part.data[0]);
        if (entry) {
          if (
            (entry.expected && entry.expected !== entry.bytes) ||
            !entry.bytes ||
            !Number.isSafeInteger(entry.index) ||
            entry.index < 0 ||
            !Number.isFinite(entry.startMs) ||
            entry.startMs < 0 ||
            !Number.isFinite(entry.endMs) ||
            (entry.index && entry.endMs <= entry.startMs)
          )
            throw fail("INCOMPLETE_AUDIO_SEGMENT");
          segments.push({
            index: entry.index,
            startMs: entry.startMs,
            endMs: entry.endMs,
            data: joinBytes(entry.chunks).buffer,
          });
          pending.delete(part.data[0]);
        }
      }
    }
    if (pending.size) throw fail("INCOMPLETE_AUDIO_SEGMENT");
    if (this.protection === 3) throw fail("ATTESTATION_REJECTED");
    let context = protoFields(this.body).find(
      (field) => field.number === 19
    ).value;
    if (this.cookie) context = replaceProto(context, 3, 2, this.cookie);
    const updated = StreamerContext.encode({
      ...StreamerContext.decode(context),
      sabrContexts: [...this.contexts.values()].filter((entry) =>
        this.active.has(entry.type)
      ),
      unsentSabrContexts: [
        ...new Set([...this.unsent, ...this.contexts.keys()]),
      ].filter((type) => !this.active.has(type)),
    }).finish();
    context = joinBytes([
      ...protoFields(context)
        .filter((field) => ![5, 6].includes(field.number))
        .map((field) => field.raw),
      ...protoFields(updated)
        .filter((field) => [5, 6].includes(field.number))
        .map((field) => field.raw),
    ]);
    this.body = replaceProto(this.body, 19, 2, context);
    return {
      segments,
      expectedSegments: this.expectedSegments,
      expectedEndMs: this.expectedEndMs,
      protection: this.protection,
      backoffMs: this.backoffMs,
    };
  }
}
