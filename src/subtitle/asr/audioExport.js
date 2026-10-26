import { createFile, DataStream } from "mp4box";

const fail = (code) => Object.assign(new Error(code), { code });
const check = (signal) => {
  if (signal?.aborted)
    throw signal.reason || new DOMException("Cancelled", "AbortError");
};

/** Ordered initialization + complete media segments, remuxed as standard fragmented M4A. */
export async function remuxAac(
  segments,
  {
    signal,
    onProgress = () => {},
    startMs = 0,
    endMs = Infinity,
    maxBytes = 512 * 1024 * 1024,
  } = {}
) {
  const input = createFile(true),
    output = createFile();
  const fragments = [];
  const ranged = Number.isFinite(endMs);
  let previousIndex,
    readEnd,
    retainedBytes = 0;
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
      if (readEnd !== undefined && Math.abs(sample.dts - readEnd) > 1)
        throw fail("AUDIO_GAP");
      readEnd = sample.dts + sample.duration;
      if (
        sample.cts + sample.duration <= (startMs * info.timescale) / 1000 ||
        sample.cts >= (endMs * info.timescale) / 1000
      )
        continue;
      retainedBytes += sample.data.byteLength;
      if (retainedBytes > maxBytes) throw fail("AUDIO_EXPORT_TOO_LARGE");
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
      if (
        previousIndex === undefined
          ? segment.index !== 0
          : segment.index !== previousIndex + 1 &&
            !(ranged && previousIndex === 0 && segment.index > 0)
      )
        throw fail("AUDIO_GAP");
      previousIndex = segment.index;
      expectedIndex++;
      const bytes = new Uint8Array(segment.data);
      if (!bytes.length || bytes.length > 16 * 1024 * 1024)
        throw fail("INVALID_AUDIO_SEGMENT");
      const buffer = bytes.slice().buffer;
      buffer.fileStart = offset;
      offset += buffer.byteLength;
      input.appendBuffer(buffer);
      if (error) throw error;
      onProgress({ phase: "generating", segments: expectedIndex, samples });
      if (ranged && info && sampleEnd / info.timescale >= endMs / 1000) break;
    }
    input.flush();
    if (error) throw error;
    check(signal);
    if (
      !info ||
      !samples ||
      (!ranged &&
        input.getTrackById(info.id).nextSample !==
          input.getTrackById(info.id).samples.length)
    )
      throw fail("AUDIO_INCOMPLETE");
    if (
      ranged &&
      (firstDts / info.timescale > startMs / 1000 + 1 / info.timescale ||
        sampleEnd / info.timescale < endMs / 1000 - 1 / info.timescale)
    )
      throw fail("AUDIO_RANGE_MISSING");
    const duration = sampleEnd - firstDts;
    output.moov.mvhd.duration = duration;
    output.getTrackById(outputTrack).tkhd.duration = duration;
    output.getTrackById(outputTrack).mdia.mdhd.duration = duration;
    const blob = new Blob([output.getBuffer().buffer, ...fragments], {
      type: "audio/mp4",
    });
    if (blob.size > maxBytes) throw fail("AUDIO_EXPORT_TOO_LARGE");
    onProgress({ phase: "ready", segments: expectedIndex, samples });
    return {
      blob,
      durationSeconds: duration / info.timescale,
      startMs: (firstDts * 1000) / info.timescale,
      endMs: (sampleEnd * 1000) / info.timescale,
      samples,
      sampleRate: info.audio.sample_rate,
      channels: info.audio.channel_count,
    };
  } finally {
    input.stop();
  }
}

/** Preserve original AAC frames intersecting the requested interval; no re-encoding. */
export async function cropAacSentence(segments, startMs, endMs, options = {}) {
  if (
    !Number.isFinite(startMs) ||
    startMs < 0 ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  )
    throw fail("INVALID_AUDIO_RANGE");
  return remuxAac(segments, { ...options, startMs, endMs });
}
