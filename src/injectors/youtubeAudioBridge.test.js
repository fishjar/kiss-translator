import { TextEncoder, TextDecoder } from "util";
import { webcrypto } from "crypto";
import { ReadableStream } from "stream/web";
import { CompositeBuffer, UmpWriter } from "googlevideo/ump";
import { FormatId } from "googlevideo/protos";
import { readUmp, joinBytes, replaceProto } from "../subtitle/asr/sabrProtocol";
import { installYoutubeAudioBridge } from "./youtubeAudioBridge";
import { YoutubeAudioBridgeClient } from "../subtitle/asr/audioBridge";
import {
  VIDEO_ID,
  AAC_FORMAT,
  NATIVE_FORMAT,
  nativeRequestBody,
  mediaResponse,
} from "../subtitle/asr/fixtures/sabr";

const saved = {
  post: window.postMessage,
  crypto: Object.getOwnPropertyDescriptor(globalThis, "crypto"),
  encoder: globalThis.TextEncoder,
  decoder: globalThis.TextDecoder,
  Request: globalThis.Request,
};
const response = (bytes) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/vnd.yt-ump" },
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }),
  clone() {
    return response(bytes);
  },
});
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
};
let bridge, client, player, nativeFetch, posts;
beforeEach(() => {
  window.history.replaceState({}, "", `/watch?v=${VIDEO_ID}`);
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
  posts = [];
  window.postMessage = (data) => {
    posts.push(data);
    Promise.resolve().then(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin: window.location.origin,
          data,
        })
      )
    );
  };
  player = {
    matches: () => false,
    getVideoData: () => ({ video_id: VIDEO_ID }),
    getDuration: () => 2,
    getPlayerResponse: () => ({
      videoDetails: { videoId: VIDEO_ID },
      streamingData: {
        adaptiveFormats: [
          {
            ...NATIVE_FORMAT,
            audioTrack: { id: "en-US.4" },
            mimeType: "audio/webm",
          },
          {
            ...AAC_FORMAT,
            audioTrack: { id: "en-US.4" },
            mimeType: "audio/mp4",
            approxDurationMs: "2000",
          },
        ],
      },
    }),
  };
  nativeFetch = jest.fn(async () => response(mediaResponse()));
  bridge = installYoutubeAudioBridge({
    fetch: nativeFetch,
    getPlayer: () => player,
    getVideoId: () => new URL(window.location.href).searchParams.get("v"),
  });
  client = new YoutubeAudioBridgeClient();
});
afterEach(async () => {
  client.dispose();
  bridge.dispose();
  await flush();
  window.postMessage = saved.post;
  globalThis.TextEncoder = saved.encoder;
  globalThis.TextDecoder = saved.decoder;
  globalThis.Request = saved.Request;
  if (saved.crypto) Object.defineProperty(globalThis, "crypto", saved.crypto);
  else delete globalThis.crypto;
});
async function capture() {
  const entry = bridge.prepare([
    "https://rr1.example.googlevideo.com/videoplayback?cpn=native",
    { method: "POST", body: nativeRequestBody() },
  ]);
  bridge.observe(
    Promise.resolve(response(mediaResponse(NATIVE_FORMAT))),
    entry
  );
  await flush();
}

test("native body/response capture yields identity only; page commands cannot choose arbitrary URLs", async () => {
  await capture();
  const metadata = await client.snapshot(VIDEO_ID);
  expect(metadata.identity.trackId).toBe("en-US.4");
  expect(metadata.identity.mediaVersion).toMatch(/^140\.123\.[a-f0-9]{64}$/);
  expect(JSON.stringify(posts)).not.toContain("cpn=native");
  expect(JSON.stringify(posts)).not.toContain("poToken");
  await client.open(VIDEO_ID, "session", 0);
  const result = await client.next(VIDEO_ID, "session");
  expect(result.segments).toHaveLength(1);
  expect(new Uint8Array(result.segments[0].data)).toEqual(
    new Uint8Array([4, 5, 6])
  );
  expect(nativeFetch).toHaveBeenCalledTimes(1);
  const url = new URL(nativeFetch.mock.calls[0][0]);
  expect(url.hostname).toBe("rr1.example.googlevideo.com");
  expect(url.pathname).toBe("/videoplayback");
});

test("Request clones are captured before native consumption, without requiring init.body", async () => {
  const clone = jest.fn(() => ({
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(nativeRequestBody());
        controller.close();
      },
    }),
  }));
  globalThis.Request = class {
    constructor() {
      this.url = "https://rr1.example.googlevideo.com/videoplayback";
      this.method = "POST";
      this.credentials = "include";
    }
    clone() {
      return clone();
    }
  };
  const entry = bridge.prepare([new Request()]);
  bridge.observe(
    Promise.resolve(response(mediaResponse(NATIVE_FORMAT))),
    entry
  );
  await flush();
  expect(clone).toHaveBeenCalledTimes(1);
  expect((await client.snapshot(VIDEO_ID)).identity.videoId).toBe(VIDEO_ID);
});

test("capture is independent of ASR configuration; ads cannot start media requests", async () => {
  await expect(client.open(VIDEO_ID, "no-capture", 0)).rejects.toHaveProperty(
    "code",
    "NEED_PLAYBACK"
  );
  client.configure(false);
  await flush();
  await capture();
  expect((await client.snapshot(VIDEO_ID)).identity.videoId).toBe(VIDEO_ID);
  player.matches = () => true;
  await expect(client.open(VIDEO_ID, "ad", 0)).rejects.toHaveProperty(
    "code",
    "WAITING_FOR_PLAYER"
  );
  expect(nativeFetch).not.toHaveBeenCalled();
});

test("navigation clears authentication state and late results cannot belong to the next video", async () => {
  await capture();
  await client.open(VIDEO_ID, "session", 0);
  bridge.clear();
  window.history.replaceState({}, "", "/watch?v=bs7WQKv4_ZU");
  await expect(client.next(VIDEO_ID, "session")).rejects.toHaveProperty(
    "code",
    "STALE_VIDEO"
  );
  expect(nativeFetch).not.toHaveBeenCalled();
});

test("oversized and non-SABR observations do not consume all capture slots", async () => {
  for (let i = 0; i < 3; i++)
    expect(
      bridge.prepare([
        "https://rr1.example.googlevideo.com/videoplayback",
        {
          method: "POST",
          body: new Uint8Array(70000),
        },
      ])
    ).toBeUndefined();
  await capture();
  expect((await client.snapshot(VIDEO_ID)).identity.videoId).toBe(VIDEO_ID);
});

test("early native responses are retained until the player API becomes ready", async () => {
  player.getVideoData = () => ({});
  await capture();
  player.getVideoData = () => ({ video_id: VIDEO_ID });
  expect((await client.snapshot(VIDEO_ID)).identity.videoId).toBe(VIDEO_ID);
});

test("stopping a job retains captured parameters for paused restart", async () => {
  await capture();
  client.clear();
  await flush();
  expect((await client.snapshot(VIDEO_ID)).identity.videoId).toBe(VIDEO_ID);
  await client.open(VIDEO_ID, "after-stop", 0);
  await client.next(VIDEO_ID, "after-stop");
  expect(nativeFetch).toHaveBeenCalledTimes(1);
});

test("playing without a captured request reports missing capture, not a request to play again", async () => {
  player.querySelector = () => ({ paused: false });
  await expect(client.snapshot(VIDEO_ID)).rejects.toHaveProperty(
    "code",
    "AUDIO_CAPTURE_MISSING"
  );
  expect(nativeFetch).not.toHaveBeenCalled();
});

test("capture parse failures are reported through snapshots and a later valid capture recovers", async () => {
  const entry = bridge.prepare([
    "https://rr1.example.googlevideo.com/videoplayback",
    { method: "POST", body: nativeRequestBody() },
  ]);
  bridge.observe(Promise.resolve(response(new Uint8Array([255]))), entry);
  await flush();
  await expect(client.snapshot(VIDEO_ID)).rejects.not.toHaveProperty(
    "code",
    "NEED_PLAYBACK"
  );
  await capture();
  expect((await client.snapshot(VIDEO_ID)).identity.videoId).toBe(VIDEO_ID);
  expect(nativeFetch).not.toHaveBeenCalled();
});

test("later media responses without init metadata can recover capture using current-player formats", async () => {
  const buffer = new CompositeBuffer(),
    writer = new UmpWriter(buffer);
  for (const part of readUmp(mediaResponse(NATIVE_FORMAT)))
    if (part.type !== 42) writer.write(part.type, part.data);
  const bytes = joinBytes(buffer.chunks);
  const entry = bridge.prepare([
    "https://rr1.example.googlevideo.com/videoplayback",
    { method: "POST", body: nativeRequestBody() },
  ]);
  bridge.observe(Promise.resolve(response(bytes)), entry);
  await flush();
  expect((await client.snapshot(VIDEO_ID)).identity.trackId).toBe("en-US.4");
  await client.open(VIDEO_ID, "late-response", 0);
  expect((await client.next(VIDEO_ID, "late-response")).segments).toHaveLength(
    1
  );
});

test("current-player format fallback cannot authenticate another video's response", async () => {
  const buffer = new CompositeBuffer(),
    writer = new UmpWriter(buffer);
  for (const part of readUmp(mediaResponse(NATIVE_FORMAT)))
    if (part.type !== 42) writer.write(part.type, part.data);
  player.getPlayerResponse = () => ({
    videoDetails: { videoId: "bs7WQKv4_ZU" },
    streamingData: {
      adaptiveFormats: [{ ...NATIVE_FORMAT, mimeType: "audio/webm" }],
    },
  });
  const entry = bridge.prepare([
    "https://rr1.example.googlevideo.com/videoplayback",
    { method: "POST", body: nativeRequestBody() },
  ]);
  bridge.observe(Promise.resolve(response(joinBytes(buffer.chunks))), entry);
  await flush();
  await expect(client.snapshot(VIDEO_ID)).rejects.toHaveProperty(
    "code",
    "NATIVE_AUDIO_NOT_CONFIRMED"
  );
  expect(nativeFetch).not.toHaveBeenCalled();
});

test("page capture before ASR configuration survives a long pause and starts download", async () => {
  const now = Date.now();
  await capture();
  const clock = jest.spyOn(Date, "now").mockReturnValue(now + 120000);
  try {
    player.querySelector = () => ({ paused: true });
    client.configure(false);
    await flush();
    await client.open(VIDEO_ID, "paused", 0);
    expect((await client.next(VIDEO_ID, "paused")).segments).toHaveLength(1);
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  } finally {
    clock.mockRestore();
  }
});

test("expired signed URL is rejected instead of replayed", async () => {
  const entry = bridge.prepare([
    "https://rr1.example.googlevideo.com/videoplayback?expire=1",
    { method: "POST", body: nativeRequestBody() },
  ]);
  bridge.observe(
    Promise.resolve(response(mediaResponse(NATIVE_FORMAT))),
    entry
  );
  await flush();
  await expect(client.open(VIDEO_ID, "expired", 0)).rejects.toHaveProperty(
    "code",
    "NEED_PLAYBACK"
  );
  expect(nativeFetch).not.toHaveBeenCalled();
});

test("player parameters can start paused SABR without an observed playback request", async () => {
  const metadata = player.getPlayerResponse();
  metadata.streamingData.serverAbrStreamingUrl =
    "https://rr1.example.googlevideo.com/videoplayback";
  metadata.playerConfig = {
    mediaCommonConfig: {
      mediaUstreamerRequestConfig: { videoPlaybackUstreamerConfig: "AQID" },
    },
  };
  player.getPlayerResponse = () => metadata;
  const original = window.ytcfg;
  window.ytcfg = {
    get: (key) =>
      ({
        INNERTUBE_CONTEXT_CLIENT_NAME: 1,
        INNERTUBE_CONTEXT_CLIENT_VERSION: "2.20261018",
      })[key],
  };
  try {
    await client.open(VIDEO_ID, "parameters", 0);
    expect((await client.next(VIDEO_ID, "parameters")).segments).toHaveLength(
      1
    );
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  } finally {
    window.ytcfg = original;
  }
});

test("authentication rejection discards captured credentials and retries using current player parameters", async () => {
  await capture();
  const metadata = player.getPlayerResponse();
  metadata.streamingData.serverAbrStreamingUrl =
    "https://rr2.example.googlevideo.com/videoplayback";
  metadata.playerConfig = {
    mediaCommonConfig: {
      mediaUstreamerRequestConfig: { videoPlaybackUstreamerConfig: "AQID" },
    },
  };
  player.getPlayerResponse = () => metadata;
  const original = window.ytcfg;
  window.ytcfg = {
    get: (key) =>
      ({
        INNERTUBE_CONTEXT_CLIENT_NAME: 1,
        INNERTUBE_CONTEXT_CLIENT_VERSION: "2.20261018",
      })[key],
  };
  nativeFetch.mockResolvedValueOnce({
    ok: false,
    status: 403,
    headers: { get: () => null },
  });
  try {
    await client.open(VIDEO_ID, "auth", 0);
    await expect(client.next(VIDEO_ID, "auth")).rejects.toHaveProperty(
      "code",
      "AUDIO_AUTH_EXPIRED"
    );
    await client.open(VIDEO_ID, "auth", 0);
    await client.next(VIDEO_ID, "auth");
    expect(nativeFetch.mock.calls[1][0]).toContain(
      "rr2.example.googlevideo.com"
    );
  } finally {
    window.ytcfg = original;
  }
});

test("retained requests are selected per current audio track", async () => {
  await capture();
  const english = player.getPlayerResponse();
  const japanese = english.streamingData.adaptiveFormats.map((entry) => ({
    ...entry,
    xtags: "lang=ja",
    audioTrack: { id: "ja.10" },
  }));
  player.getPlayerResponse = () => ({
    ...english,
    streamingData: {
      adaptiveFormats: [...english.streamingData.adaptiveFormats, ...japanese],
    },
  });
  const format = { ...NATIVE_FORMAT, xtags: "lang=ja" };
  const entry = bridge.prepare([
    "https://rr2.example.googlevideo.com/videoplayback",
    {
      method: "POST",
      body: replaceProto(
        nativeRequestBody(),
        16,
        2,
        FormatId.encode(format).finish()
      ),
    },
  ]);
  bridge.observe(Promise.resolve(response(mediaResponse(format))), entry);
  await flush();
  player.getAudioTrack = () => ({ id: "en-US.4" });
  expect((await client.snapshot(VIDEO_ID)).identity.trackId).toBe("en-US.4");
  player.getAudioTrack = () => ({ id: "ja.10" });
  expect((await client.snapshot(VIDEO_ID)).identity.trackId).toBe("ja.10");
});

test("stopping during snapshot hashing cannot resurrect a cancelled download session", async () => {
  await capture();
  let finish;
  const digest = jest.spyOn(crypto.subtle, "digest").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  try {
    const open = client.open(VIDEO_ID, "cancelled-open", 0);
    await flush();
    client.clear();
    await flush();
    finish(new Uint8Array(32).buffer);
    await expect(open).rejects.toHaveProperty("code", "TIMEOUT");
    await expect(
      client.next(VIDEO_ID, "cancelled-open")
    ).rejects.toHaveProperty("code", "AUDIO_SESSION_MISSING");
  } finally {
    digest.mockRestore();
  }
});

test("stopping ASR does not cancel a passive capture already in flight", async () => {
  const entry = bridge.prepare([
    "https://rr1.example.googlevideo.com/videoplayback",
    { method: "POST", body: nativeRequestBody() },
  ]);
  client.clear();
  await flush();
  bridge.observe(
    Promise.resolve(response(mediaResponse(NATIVE_FORMAT))),
    entry
  );
  await flush();
  await client.open(VIDEO_ID, "captured-after-stop", 0);
  expect(nativeFetch).not.toHaveBeenCalled();
});

test("a late older playback response cannot replace newer parameters for the same track", async () => {
  const old = bridge.prepare([
    "https://rr1.example.googlevideo.com/videoplayback",
    { method: "POST", body: nativeRequestBody() },
  ]);
  const recent = bridge.prepare([
    "https://rr2.example.googlevideo.com/videoplayback",
    { method: "POST", body: nativeRequestBody() },
  ]);
  bridge.observe(
    Promise.resolve(response(mediaResponse(NATIVE_FORMAT))),
    recent
  );
  await flush();
  bridge.observe(Promise.resolve(response(mediaResponse(NATIVE_FORMAT))), old);
  await flush();
  await client.open(VIDEO_ID, "latest", 0);
  await client.next(VIDEO_ID, "latest");
  expect(nativeFetch.mock.calls[0][0]).toContain("rr2.example.googlevideo.com");
});

test("single-track videos without audioTrack retain native capture and resolve the default track", async () => {
  const metadata = player.getPlayerResponse();
  metadata.streamingData.adaptiveFormats =
    metadata.streamingData.adaptiveFormats.map(
      ({ audioTrack, ...format }) => format
    );
  player.getPlayerResponse = () => metadata;
  await capture();
  const snapshot = await client.snapshot(VIDEO_ID);
  expect(snapshot.identity.trackId).toBe("default");
  expect(snapshot.identity.sourceLanguage).toBe("auto");
  await client.open(VIDEO_ID, "implicit-track", 0);
  expect((await client.next(VIDEO_ID, "implicit-track")).segments).toHaveLength(
    1
  );
});

test("paused parameter fallback supports unlabelled single-track AAC with a separate DRC variant", async () => {
  const metadata = player.getPlayerResponse();
  const formats = metadata.streamingData.adaptiveFormats.map(
    ({ audioTrack, xtags, ...format }) => format
  );
  metadata.streamingData.adaptiveFormats = [
    ...formats,
    ...formats.map((format) => ({ ...format, xtags: "drc=1" })),
  ];
  metadata.streamingData.serverAbrStreamingUrl =
    "https://rr1.example.googlevideo.com/videoplayback";
  metadata.playerConfig = {
    mediaCommonConfig: {
      mediaUstreamerRequestConfig: { videoPlaybackUstreamerConfig: "AQID" },
    },
  };
  player.getPlayerResponse = () => metadata;
  const original = window.ytcfg;
  window.ytcfg = {
    get: (key) =>
      ({
        INNERTUBE_CONTEXT_CLIENT_NAME: 1,
        INNERTUBE_CONTEXT_CLIENT_VERSION: "2.20261018",
      })[key],
  };
  try {
    const snapshot = await client.open(VIDEO_ID, "implicit-parameters", 0);
    expect(snapshot.identity).toMatchObject({
      trackId: "default",
      sourceLanguage: "auto",
    });
    expect(snapshot.format.xtags).toBe("");
  } finally {
    window.ytcfg = original;
  }
});
