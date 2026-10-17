import { TextEncoder, TextDecoder } from "util";
import { webcrypto } from "crypto";
import { ReadableStream } from "stream/web";
import { CompositeBuffer, UmpWriter } from "googlevideo/ump";
import { readUmp, joinBytes } from "../subtitle/asr/sabrProtocol";
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

test("wrong video/ad metadata and disabled capture cannot start media requests", async () => {
  await expect(client.snapshot(VIDEO_ID)).rejects.toHaveProperty(
    "code",
    "NEED_PLAYBACK"
  );
  client.configure(false);
  await flush();
  await capture();
  await expect(client.snapshot(VIDEO_ID)).rejects.toHaveProperty(
    "code",
    "NEED_PLAYBACK"
  );
  client.configure(true);
  await flush();
  player.matches = () => true;
  await capture();
  await expect(client.snapshot(VIDEO_ID)).rejects.toHaveProperty(
    "code",
    "NEED_PLAYBACK"
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

test("stopping a job drops signed requests but retains a non-secret identity for caption cache recovery", async () => {
  await capture();
  client.clear();
  await flush();
  expect((await client.snapshot(VIDEO_ID)).identity.videoId).toBe(VIDEO_ID);
  await expect(client.open(VIDEO_ID, "after-stop", 0)).rejects.toHaveProperty(
    "code",
    "NEED_PLAYBACK"
  );
  expect(nativeFetch).not.toHaveBeenCalled();
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
