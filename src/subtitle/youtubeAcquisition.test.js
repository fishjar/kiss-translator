import {
  YouTubeCaptionAcquirer,
  YouTubeCaptionBridgeClient,
  YOUTUBE_CAPTION_PROTOCOL,
  captionCandidates,
  retryAfterDeadline,
} from "./youtubeAcquisition";
import {
  activeYoutubePlayer,
  captionTrackId,
  captionUrl,
  parseTimedText,
  selectCaptionTrack,
  youtubeVideoId,
} from "./youtubeCaptionSource";

const track = {
  languageCode: "en",
  vssId: "a.en",
  kind: "asr",
  baseUrl: "https://www.youtube.com/api/timedtext?v=one&lang=en&kind=asr",
};
const events = [
  { tStartMs: 100, dDurationMs: 900, segs: [{ utf8: "Hello", tOffsetMs: 0 }] },
];
const body = JSON.stringify({ events });
const snapshot = (patch = {}) => ({
  videoId: "one",
  ready: true,
  selectedTrack: track,
  captionTracks: [track],
  captures: [],
  ...patch,
});
const fixture = (handler) => {
  const bridge = {
    request: jest.fn(
      async (action, videoId, data) =>
        handler?.(action, data) ??
        (action === "fetch" ? { status: 200, body } : snapshot())
    ),
  };
  const onState = jest.fn();
  return {
    bridge,
    onState,
    acquirer: new YouTubeCaptionAcquirer(bridge, onState),
  };
};

test("binds Shorts to the active reel, not a hidden watch player", () => {
  window.history.replaceState({}, "", "/shorts/one");
  document.body.innerHTML =
    '<div id="movie_player"><video></video></div><ytd-reel-video-renderer is-active><div class="html5-video-player" id="active"><video></video></div></ytd-reel-video-renderer>';
  expect(youtubeVideoId()).toBe("one");
  expect(activeYoutubePlayer().id).toBe("active");
});

test("does not fall back to an arbitrary track or confuse two same-language tracks", () => {
  const named = { ...track, vssId: "a.en.second" };
  expect(
    selectCaptionTrack(
      snapshot({
        selectedTrack: { ...track, vssId: "missing" },
        captionTracks: [track, named],
      })
    )
  ).toBeNull();
  expect(
    selectCaptionTrack(
      snapshot({
        selectedTrack: null,
        captionTracks: [track, named],
        defaultCaptionTrackIndex: 1,
      })
    )
  ).toBe(named);
  expect(captionTrackId(named)).not.toBe(captionTrackId(track));
});

test("validates origin, video identity and original-track URL without mutating inputs", () => {
  expect(captionUrl("https://evil.test/api/timedtext?v=one", "one")).toBeNull();
  expect(captionUrl(track.baseUrl, "two")).toBeNull();
  const captured = track.baseUrl + "&pot=secret&tlang=zh&signature=signature";
  const urls = captionCandidates(
    snapshot({ captures: [{ url: captured }] }),
    track,
    "one"
  );
  expect(urls[0]).toContain("pot=secret");
  expect(urls[0]).toContain("signature=signature");
  expect(urls[0]).not.toContain("tlang");
  expect(captured).toContain("tlang=zh");
});

test("preserves JSON3 offsets and parses SRV1/SRV3 times without inventing word offsets", () => {
  expect(parseTimedText(body)).toEqual(events);
  expect(
    parseTimedText(
      '<transcript><text start="1.5" dur="2">Hi &amp; bye</text></transcript>'
    )[0]
  ).toEqual({
    tStartMs: 1500,
    dDurationMs: 2000,
    segs: [{ utf8: "Hi & bye" }],
  });
  expect(
    parseTimedText(
      '<timedtext><body><p t="100" d="900"><s t="0">Hi</s><s t="400"> there</s></p></body></timedtext>'
    )[0].segs
  ).toEqual([
    { utf8: "Hi", tOffsetMs: 0 },
    { utf8: " there", tOffsetMs: 400 },
  ]);
  expect(() => parseTimedText("")).toThrow("EMPTY_RESPONSE");
  expect(() => parseTimedText('{"events":[]}')).toThrow("EMPTY_EVENTS");
  expect(() => parseTimedText("<html>bad</html>")).toThrow("INVALID_FORMAT");
});

test("uses a captured body without downloading it and merges concurrent requests", async () => {
  const f = fixture((action) =>
    action === "snapshot"
      ? snapshot({ captures: [{ url: track.baseUrl, response: body }] })
      : undefined
  );
  const first = f.acquirer.acquire("one");
  expect(f.acquirer.acquire("one")).toBe(first);
  expect(await first).toMatchObject({ source: "capture", events });
  expect(
    f.bridge.request.mock.calls.some(([action]) => action === "fetch")
  ).toBe(false);
});

test("valid source captures work when optional player metadata is missing", async () => {
  const f = fixture((action) =>
    action === "snapshot"
      ? snapshot({
          ready: false,
          captionTracks: [],
          selectedTrack: null,
          captures: [{ url: track.baseUrl, response: body }],
        })
      : undefined
  );
  await expect(f.acquirer.acquire("one")).resolves.toMatchObject({
    source: "capture",
    events,
    track: { languageCode: "en" },
  });
  expect(
    f.bridge.request.mock.calls.some(([action]) => action === "metadata")
  ).toBe(false);
});

test("ignores a different named source track even if the language matches", async () => {
  const selected = { ...track, baseUrl: track.baseUrl + "&name=selected" };
  const f = fixture((action) =>
    action === "snapshot"
      ? snapshot({
          selectedTrack: selected,
          captionTracks: [selected],
          captures: [
            {
              url: track.baseUrl + "&name=other",
              response: '{"events":[{"segs":[{"utf8":"wrong"}]}]}',
            },
          ],
        })
      : undefined
  );
  await expect(f.acquirer.acquire("one")).resolves.toMatchObject({
    source: "request",
    events,
  });
});

test("rejects a result if the selected track changed during download", async () => {
  let reads = 0;
  const f = fixture((action) =>
    action === "snapshot" && ++reads > 1
      ? snapshot({ selectedTrack: { ...track, vssId: "changed" } })
      : undefined
  );
  await expect(f.acquirer.acquire("one")).rejects.toMatchObject({
    code: "STALE_TRACK",
  });
});

test("a known empty track list is distinct from an empty successful response", async () => {
  const f = fixture((action) =>
    ["snapshot", "metadata"].includes(action)
      ? snapshot({ selectedTrack: null, captionTracks: [] })
      : undefined
  );
  await expect(f.acquirer.acquire("one")).rejects.toMatchObject({
    code: "NO_SUBTITLES",
  });
});

test("200 empty responses refresh parameters once and recover without becoming no-subtitles", async () => {
  let refreshed = false;
  const f = fixture((action) => {
    if (action === "refresh") {
      refreshed = true;
      return snapshot();
    }
    if (action === "snapshot")
      return snapshot({
        captures: refreshed
          ? [{ url: track.baseUrl + "&pot=new", response: body }]
          : [],
      });
    if (action === "fetch") return { status: 200, body: "" };
  });
  await expect(f.acquirer.acquire("one")).resolves.toMatchObject({
    events,
    source: "capture",
  });
  expect(
    f.bridge.request.mock.calls.filter(([action]) => action === "refresh")
  ).toHaveLength(1);
});

test("429 exposes the real cooldown and does not perform an immediate retry", async () => {
  const f = fixture((action) =>
    action === "fetch" ? { status: 429, retryAfter: "60" } : undefined
  );
  await expect(f.acquirer.acquire("one")).rejects.toMatchObject({
    code: "RATE_LIMITED",
    cooldownUntil: expect.any(Number),
  });
  expect(
    f.bridge.request.mock.calls.filter(([action]) => action === "fetch")
  ).toHaveLength(1);
  expect(retryAfterDeadline("2", 1000)).toBe(3000);
});

test("persistent network errors have two retries and a bounded refresh", async () => {
  jest.useFakeTimers();
  const f = fixture((action) => {
    if (action === "fetch")
      throw Object.assign(new Error("offline"), { code: "NETWORK" });
  });
  const outcome = f.acquirer.acquire("one").catch((error) => error);
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 15; j++) await Promise.resolve();
    jest.advanceTimersByTime(500);
  }
  expect(await outcome).toMatchObject({ code: "NETWORK" });
  expect(
    f.bridge.request.mock.calls.filter(([action]) => action === "fetch")
  ).toHaveLength(3);
  expect(
    f.bridge.request.mock.calls.filter(([action]) => action === "refresh")
  ).toHaveLength(0);
  jest.useRealTimers();
});

test("a waiting player reaches the 30 second deadline instead of polling forever", async () => {
  jest.useFakeTimers();
  const f = fixture((action) =>
    ["snapshot", "metadata"].includes(action)
      ? snapshot({ ready: false })
      : undefined
  );
  const outcome = f.acquirer.acquire("one").catch((error) => error);
  for (let i = 0; i < 65; i++) {
    for (let j = 0; j < 15; j++) await Promise.resolve();
    jest.advanceTimersByTime(500);
  }
  expect(await outcome).toMatchObject({ code: "TIMEOUT" });
  expect(
    f.bridge.request.mock.calls.filter(([action]) => action === "metadata")
  ).toHaveLength(1);
  jest.useRealTimers();
});

test("cancelling a video aborts its page requests and permits a fresh request", async () => {
  const f = fixture((action) =>
    action === "snapshot" ? snapshot({ ready: false }) : undefined
  );
  const result = f.acquirer.acquire("one");
  await Promise.resolve();
  f.acquirer.cancel();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(f.bridge.request.mock.calls[0][2].signal.aborted).toBe(true);
});

test("client ignores forged response origins and cancels pending RPC on disposal", async () => {
  window.history.replaceState({}, "", "/watch?v=one");
  const client = new YouTubeCaptionBridgeClient();
  const promise = client.request("snapshot", "one");
  const requestId = [...client.pending.keys()][0];
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      origin: "https://evil.test",
      data: {
        protocol: YOUTUBE_CAPTION_PROTOCOL,
        type: "response",
        requestId,
        result: snapshot(),
      },
    })
  );
  expect(client.pending.size).toBe(1);
  client.dispose();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
});
