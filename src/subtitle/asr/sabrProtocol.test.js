import { TextEncoder, TextDecoder } from "util";
import { CompositeBuffer, UmpWriter } from "googlevideo/ump";
import {
  FormatId,
  FormatInitializationMetadata,
  MediaHeader,
  StreamProtectionStatus,
  NextRequestPolicy,
  PlaybackCookie,
  StreamerContext,
} from "googlevideo/protos";
import {
  protoFields,
  protoField,
  protoInteger,
  joinBytes,
  readUmp,
  sabrUrl,
  nativeAudioFormat,
  selectedAacFormat,
  SabrAudioSession,
} from "./sabrProtocol";

const oldEncoder = globalThis.TextEncoder,
  oldDecoder = globalThis.TextDecoder;
beforeAll(() => {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
});
afterAll(() => {
  globalThis.TextEncoder = oldEncoder;
  globalThis.TextDecoder = oldDecoder;
});
const format = { itag: 140, lastModified: "123", xtags: "lang=en" };
const native = { ...format, itag: 251 };
const context = () =>
  StreamerContext.encode({
    poToken: new Uint8Array([1, 2, 3]),
    sabrContexts: [],
    unsentSabrContexts: [],
  }).finish();
const body = () =>
  joinBytes([
    protoField(1, 2, new Uint8Array()),
    protoField(16, 2, FormatId.encode(native).finish()),
    protoField(19, 2, context()),
    protoField(100, 0, protoInteger(555)),
  ]);
function ump(parts) {
  const buffer = new CompositeBuffer(),
    writer = new UmpWriter(buffer);
  parts.forEach(([type, data]) => writer.write(type, data));
  return joinBytes(buffer.chunks);
}
function response(selected = format, protection = 1) {
  return ump([
    [58, StreamProtectionStatus.encode({ status: protection }).finish()],
    [
      42,
      FormatInitializationMetadata.encode({
        videoId: "kSQknoHMFtk",
        formatId: selected,
        mimeType: selected.itag === 140 ? "audio/mp4" : "audio/webm",
        endSegmentNumber: "2",
        durationUnits: "2000",
        durationTimescale: "1000",
      }).finish(),
    ],
    [
      20,
      MediaHeader.encode({
        headerId: 1,
        videoId: "kSQknoHMFtk",
        itag: selected.itag,
        lmt: selected.lastModified,
        xtags: selected.xtags,
        sequenceNumber: 1,
        startMs: "0",
        durationMs: "1000",
        contentLength: "3",
      }).finish(),
    ],
    [21, new Uint8Array([1, 4, 5, 6])],
    [22, new Uint8Array([1])],
  ]);
}

test("pinned UMP parser rejects truncated parts, and request parsing preserves unknown signed fields", () => {
  expect(readUmp(response())).toHaveLength(5);
  expect(() => readUmp(response().slice(0, -1))).toThrow("INCOMPLETE_UMP");
  const sentinel = protoField(
    25,
    0,
    new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 255, 1])
  );
  expect(protoFields(sentinel)[0].raw).toEqual(sentinel);
  expect(() => protoFields(new Uint8Array([8, 128]))).toThrow();
});

test("native selection requires real matching media, and AAC mapping cannot switch audio variants", () => {
  expect(nativeAudioFormat(body(), response(native), "kSQknoHMFtk")).toEqual(
    native
  );
  expect(() =>
    nativeAudioFormat(body(), response(native), "bs7WQKv4_ZU")
  ).toThrow("NATIVE_AUDIO_NOT_CONFIRMED");
  const player = {
    videoDetails: { videoId: "kSQknoHMFtk" },
    streamingData: {
      adaptiveFormats: [
        { ...native, mimeType: "audio/webm", audioTrack: { id: "en-US.4" } },
        { ...format, mimeType: "audio/mp4", audioTrack: { id: "en-US.4" } },
        {
          ...format,
          xtags: "lang=en:drc=1",
          mimeType: "audio/mp4",
          audioTrack: { id: "en-US.4" },
        },
        {
          ...format,
          xtags: "lang=ja",
          mimeType: "audio/mp4",
          audioTrack: { id: "ja.10" },
        },
      ],
    },
  };
  expect(selectedAacFormat(player, native, "kSQknoHMFtk").xtags).toBe(
    "lang=en"
  );
  player.streamingData.adaptiveFormats.splice(1, 1);
  expect(() => selectedAacFormat(player, native, "kSQknoHMFtk")).toThrow(
    "AAC_TRACK_UNAVAILABLE"
  );
});

test("SABR requests preserve native auth/unknown fields and consume exact matching media only", () => {
  const session = new SabrAudioSession({
    body: body(),
    format,
    videoId: "kSQknoHMFtk",
  });
  const next = protoFields(session.request(1000));
  expect(next.find((field) => field.number === 19).value).toEqual(context());
  expect(next.find((field) => field.number === 100).raw).toEqual(
    protoFields(body()).find((field) => field.number === 100).raw
  );
  expect(
    FormatId.decode(next.find((field) => field.number === 16).value)
  ).toEqual(format);
  const result = session.consume(response());
  expect(result.expectedSegments).toBe(2);
  expect(result.expectedEndMs).toBe(2000);
  expect(new Uint8Array(result.segments[0].data)).toEqual(
    new Uint8Array([4, 5, 6])
  );
  expect(
    session.consume(response({ ...format, xtags: "lang=ja" })).segments
  ).toEqual([]);
  expect(() => session.consume(response(format, 3))).toThrow(
    "ATTESTATION_REJECTED"
  );
});

test("server playback cookies are forwarded without rewriting other auth bytes", () => {
  const session = new SabrAudioSession({
    body: body(),
    format,
    videoId: "kSQknoHMFtk",
  });
  const cookie = PlaybackCookie.encode({}).finish();
  // An opaque nonempty cookie may include fields newer than the installed schema.
  const opaque = joinBytes([cookie, protoField(20, 0, protoInteger(9))]);
  session.consume(
    ump([
      [
        35,
        joinBytes([
          NextRequestPolicy.encode({ backoffTimeMs: 1000 }).finish(),
          protoField(7, 2, opaque),
        ]),
      ],
    ])
  );
  const fields = protoFields(
    protoFields(session.request(0)).find((field) => field.number === 19).value
  );
  expect(fields.find((field) => field.number === 3).value).toEqual(opaque);
  expect(fields.find((field) => field.number === 2).value).toEqual(
    new Uint8Array([1, 2, 3])
  );
  expect(session.backoffMs).toBe(1000);
});

test("the media request boundary rejects arbitrary origins, paths, credentials and protocols", () => {
  expect(
    sabrUrl("https://rr1.example.googlevideo.com/videoplayback?x=1")
  ).not.toBeNull();
  for (const url of [
    "https://googlevideo.com.evil.test/videoplayback",
    "http://rr1.googlevideo.com/videoplayback",
    "https://user:password@rr1.googlevideo.com/videoplayback",
    "https://rr1.googlevideo.com/other",
  ])
    expect(sabrUrl(url)).toBeNull();
});

test("later native audio headers can use exact current-player metadata without repeated initialization parts", () => {
  const later = ump(
    readUmp(response(native))
      .filter((part) => part.type !== 42)
      .map((part) => [part.type, part.data])
  );
  const known = [
    { ...native, mimeType: "audio/webm", audioTrack: { id: "en-US.4" } },
  ];
  expect(nativeAudioFormat(body(), later, "kSQknoHMFtk", known)).toEqual(
    native
  );
  expect(() => nativeAudioFormat(body(), later, "kSQknoHMFtk")).toThrow(
    "NATIVE_AUDIO_NOT_CONFIRMED"
  );
  expect(() => nativeAudioFormat(body(), later, "bs7WQKv4_ZU", known)).toThrow(
    "NATIVE_AUDIO_NOT_CONFIRMED"
  );
  expect(() =>
    nativeAudioFormat(body(), later, "kSQknoHMFtk", [
      { ...native, lastModified: "456", mimeType: "audio/webm" },
    ])
  ).toThrow("NATIVE_AUDIO_NOT_CONFIRMED");
  expect(() =>
    nativeAudioFormat(body(), later, "kSQknoHMFtk", [
      { ...native, mimeType: "video/webm" },
    ])
  ).toThrow("NATIVE_AUDIO_NOT_CONFIRMED");
});
