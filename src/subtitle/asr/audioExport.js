import { createFile, DataStream } from "mp4box";
import { IncrementalAacDecoder } from "./aacDecoder";

const fail = (code) => Object.assign(new Error(code), { code });
const check = (signal) => {
  if (signal?.aborted)
    throw signal.reason || new DOMException("Cancelled", "AbortError");
};

/** Ordered initialization + complete media segments, remuxed as standard fragmented M4A. */
export async function remuxAac(
  segments,
  { signal, onProgress = () => {} } = {}
) {
  const input = createFile(true),
    output = createFile();
  const fragments = [];
  let info,
    outputTrack,
    offset = 0,
    expectedIndex = 0,
    sampleEnd,
    firstDts,
    samples = 0,
    error;
  input.onError = () => {
    error = fail("INVALID_AUDIO_CONTAINER");
  };
  input.onReady = (metadata) => {
    if (metadata.audioTracks.length !== 1 || metadata.videoTracks.length)
      throw fail("AUDIO_IDENTITY_MISMATCH");
    info = metadata.audioTracks[0];
    if (!info.codec.startsWith("mp4a.40."))
      throw fail("UNSUPPORTED_AUDIO_CODEC");
    const entry = input.getTrackById(info.id).mdia.minf.stbl.stsd.entries[0];
    if (!entry.esds) throw fail("INVALID_AUDIO_CONTAINER");
    output.init({
      brands: ["M4A ", "isom", "iso6", "mp41"],
      timescale: info.timescale,
    });
    outputTrack = output.addTrack({
      type: "mp4a",
      hdlr: "soun",
      timescale: info.timescale,
      channel_count: info.audio.channel_count,
      samplerate: info.audio.sample_rate,
      language: info.language,
      description: entry.esds,
    });
    input.setExtractionOptions(info.id, null, { nbSamples: 32 });
    input.start();
  };
  input.onSamples = (_, __, batch) => {
    check(signal);
    for (const sample of batch) {
      if (sampleEnd !== undefined && Math.abs(sample.dts - sampleEnd) > 1)
        throw fail("AUDIO_GAP");
      firstDts ??= sample.dts;
      sampleEnd = sample.dts + sample.duration;
      output.addSample(outputTrack, sample.data, {
        duration: sample.duration,
        dts: sample.dts - firstDts,
        cts: sample.cts - firstDts,
        is_sync: true,
      });
      samples++;
    }
    const stream = new DataStream();
    for (const box of output.boxes.splice(2)) box.write(stream);
    fragments.push(new Blob([stream.buffer]));
    // Keep metadata, not a second copy of the whole compressed track in MP4Box.
    output.releaseUsedSamples(outputTrack, samples);
    output.mdats.length = 0;
    output.moofs.length = 0;
    input.releaseUsedSamples(info.id, batch[batch.length - 1].number + 1);
    for (const mdat of input.mdats) mdat.stream?.cleanBuffers();
  };
  try {
    for await (const segment of segments) {
      check(signal);
      if (segment.index !== expectedIndex++) throw fail("AUDIO_GAP");
      const bytes = new Uint8Array(segment.data);
      if (!bytes.length || bytes.length > 16 * 1024 * 1024)
        throw fail("INVALID_AUDIO_SEGMENT");
      const buffer = bytes.slice().buffer;
      buffer.fileStart = offset;
      offset += buffer.byteLength;
      input.appendBuffer(buffer);
      if (error) throw error;
      onProgress({ phase: "generating", segments: expectedIndex, samples });
    }
    input.flush();
    check(signal);
    if (
      !info ||
      !samples ||
      input.getTrackById(info.id).nextSample !==
        input.getTrackById(info.id).samples.length
    )
      throw fail("AUDIO_INCOMPLETE");
    const duration = sampleEnd - firstDts;
    output.moov.mvhd.duration = duration;
    output.getTrackById(outputTrack).tkhd.duration = duration;
    output.getTrackById(outputTrack).mdia.mdhd.duration = duration;
    const blob = new Blob([output.getBuffer().buffer, ...fragments], {
      type: "audio/mp4",
    });
    onProgress({ phase: "ready", segments: expectedIndex, samples });
    return {
      blob,
      durationSeconds: duration / info.timescale,
      samples,
      sampleRate: info.audio.sample_rate,
      channels: info.audio.channel_count,
    };
  } finally {
    input.stop();
  }
}

function wavHeader(frames, rate, channels) {
  const dataSize = frames * channels * 2;
  if (dataSize > 0xffffffff - 36) throw fail("AUDIO_EXPORT_TOO_LARGE");
  const bytes = new ArrayBuffer(44),
    view = new DataView(bytes);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, dataSize + 36, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataSize, true);
  return bytes;
}

/** Decode only intersecting media (plus initialization/preroll), keep original format. */
export async function cropAacSentence(
  segments,
  startMs,
  endMs,
  { signal } = {}
) {
  if (
    !Number.isFinite(startMs) ||
    startMs < 0 ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  )
    throw fail("INVALID_AUDIO_RANGE");
  const parts = [];
  let frames = 0,
    rate,
    channels,
    firstTime,
    lastTime,
    previousIndex;
  const start = startMs / 1000,
    end = endMs / 1000;
  const decoder = new IncrementalAacDecoder(async (frame) => {
    check(signal);
    rate ??= frame.sampleRate;
    channels ??= frame.channels.length;
    if (rate !== frame.sampleRate || channels !== frame.channels.length)
      throw fail("AUDIO_IDENTITY_MISMATCH");
    wavHeader(Math.ceil((end - start) * rate), rate, channels);
    const from = Math.max(0, Math.round((start - frame.timestamp) * rate));
    const to = Math.min(
      frame.channels[0].length,
      Math.round((end - frame.timestamp) * rate)
    );
    if (to <= from) return;
    const currentStart = frame.timestamp + from / rate;
    if (lastTime !== undefined && Math.abs(currentStart - lastTime) > 1 / rate)
      throw fail("AUDIO_GAP");
    const bytes = new ArrayBuffer((to - from) * channels * 2),
      view = new DataView(bytes);
    for (let i = from; i < to; i++)
      for (let channel = 0; channel < channels; channel++) {
        const value = Math.max(-1, Math.min(1, frame.channels[channel][i]));
        view.setInt16(
          ((i - from) * channels + channel) * 2,
          Math.round(value * (value < 0 ? 32768 : 32767)),
          true
        );
      }
    firstTime ??= currentStart;
    lastTime = frame.timestamp + to / rate;
    frames += to - from;
    parts.push(bytes);
  }, signal);
  try {
    for await (const segment of segments) {
      check(signal);
      if (
        previousIndex === undefined
          ? segment.index !== 0
          : segment.index !== previousIndex + 1 && previousIndex !== 0
      )
        throw fail("AUDIO_GAP");
      previousIndex = segment.index;
      await decoder.append(new Uint8Array(segment.data));
      if (rate && lastTime >= end - 1 / rate) break;
    }
    if (
      !rate ||
      firstTime === undefined ||
      firstTime > start + 1 / rate ||
      lastTime < end - 1 / rate
    )
      throw fail("AUDIO_RANGE_MISSING");
    check(signal);
    return {
      blob: new Blob([wavHeader(frames, rate, channels), ...parts], {
        type: "audio/wav",
      }),
      sampleRate: rate,
      channels,
      frames,
    };
  } finally {
    decoder.close();
  }
}
