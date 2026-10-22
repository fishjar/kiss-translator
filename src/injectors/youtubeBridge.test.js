import { TextEncoder, TextDecoder } from "util";
import { installYoutubeBridge } from "./youtubeBridge";

const url = "https://www.youtube.com/api/timedtext?v=one&lang=en&pot=token";
const body = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Hello" }] }],
});
let originalFetch, originalPost, originalObserver, observed, posts;
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
const request = async (action, extra = {}) => {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      origin: window.location.origin,
      data: {
        protocol: "kiss-youtube-captions-v1",
        type: "request",
        requestId: action,
        videoId: "one",
        action,
        ...extra,
      },
    })
  );
  await flush();
  return posts.findLast((p) => p.type === "response" && p.requestId === action);
};

beforeEach(() => {
  window.history.replaceState({}, "", "/watch?v=one");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
  originalFetch = window.fetch;
  originalPost = window.postMessage;
  originalObserver = global.PerformanceObserver;
  posts = [];
  window.postMessage = jest.fn((data) => posts.push(data));
  window.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => body,
    clone: () => ({ text: async () => body }),
  }));
  global.PerformanceObserver = class {
    constructor(callback) {
      observed = callback;
    }
    observe() {}
    disconnect() {}
  };
  document.body.innerHTML =
    '<div id="movie_player"><video></video><button class="ytp-subtitles-button" aria-pressed="true"></button></div>';
  document.querySelector("#movie_player").getPlayerResponse = () => ({
    videoDetails: { videoId: "one" },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [{ baseUrl: url, languageCode: "en" }],
      },
    },
  });
});
afterEach(() => {
  window.__kissYoutubeCaptionBridge?.dispose();
  window.fetch = originalFetch;
  window.postMessage = originalPost;
  global.PerformanceObserver = originalObserver;
});

test("audio attaches idempotently to the existing Fetch hook without a second wrapper", async () => {
  const audio = {
    prepare: jest.fn(() => "capture"),
    observe: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
  };
  const factory = jest.fn(() => audio);
  installYoutubeBridge(factory);
  const hooked = window.fetch;
  installYoutubeBridge(factory);
  expect(window.fetch).toBe(hooked);
  expect(factory).toHaveBeenCalledTimes(1);
  await window.fetch("https://example.invalid/");
  expect(audio.prepare).toHaveBeenCalledTimes(1);
  expect(audio.observe).toHaveBeenCalledTimes(1);
});

test("installs once, clones Fetch responses and replays captured data in snapshots", async () => {
  installYoutubeBridge();
  const wrapper = window.fetch;
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  installYoutubeBridge();
  expect(window.fetch).toBe(wrapper);
  expect(XMLHttpRequest.prototype.open).toBe(open);
  expect(XMLHttpRequest.prototype.send).toBe(send);
  const result = await window.fetch(url);
  expect(await result.text()).toBe(body);
  await flush();
  expect(posts.some((p) => p.type === "capture" && p.response === body)).toBe(
    true
  );
  // A later foreground fallback must preserve the early bridge's captured body.
  installYoutubeBridge();
  expect((await request("snapshot")).result.captures[0].response).toBe(body);
});

test("Resource Timing recovers URLs when the player bypasses hooks", async () => {
  installYoutubeBridge();
  observed({ getEntries: () => [{ name: url }] });
  expect((await request("snapshot")).result.captures).toEqual([
    { url, response: undefined },
  ]);
});

test("own page fetches are not re-observed as fresh player requests", async () => {
  installYoutubeBridge();
  expect((await request("fetch", { url })).result.body).toBe(body);
  observed({ getEntries: () => [{ name: url }] });
  expect(posts.filter((p) => p.type === "capture")).toHaveLength(0);
});

test("blocks arbitrary URLs and wrong-video requests", async () => {
  const fetch = window.fetch;
  installYoutubeBridge();
  expect(
    (await request("fetch", { url: "https://evil.test/api/timedtext?v=one" }))
      .code
  ).toBe("INVALID_REQUEST");
  expect(
    (await request("fetch", { url: url.replace("v=one", "v=two") })).code
  ).toBe("INVALID_REQUEST");
  expect(fetch).not.toHaveBeenCalled();
});

test("does not discard a captured body when Resource Timing later echoes its URL", async () => {
  installYoutubeBridge();
  await window.fetch(url);
  await flush();
  observed({ getEntries: () => [{ name: url }] });
  expect((await request("snapshot")).result.captures[0].response).toBe(body);
  await request("clear");
  expect((await request("snapshot")).result.captures).toEqual([]);
});

test("balanced initialization JSON handles braces inside strings without using stale video data", async () => {
  document.querySelector("#movie_player").getPlayerResponse = () => ({
    videoDetails: { videoId: "old" },
  });
  const script = document.createElement("script");
  script.textContent =
    'var ytInitialPlayerResponse = {"videoDetails":{"videoId":"one","shortDescription":"a } brace"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[]}}};';
  document.body.appendChild(script);
  installYoutubeBridge();
  const response = (await request("snapshot")).result;
  expect(response.fullDescription).toBe("a } brace");
  expect(response.ready).toBe(false);
});

test("reloads an enabled CC track without toggling CC, and tolerates unavailable private APIs", async () => {
  const player = document.querySelector("#movie_player");
  const cc = player.querySelector(".ytp-subtitles-button");
  const click = jest.spyOn(cc, "click");
  player.setOption = jest.fn(() => {
    throw new Error("not ready");
  });
  installYoutubeBridge();
  expect((await request("refresh")).result.videoId).toBe("one");
  expect(player.setOption).toHaveBeenCalledWith("captions", "reload", true);
  expect(click).not.toHaveBeenCalled();
});
