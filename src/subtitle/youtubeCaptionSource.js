// Pure identity, track selection and timedtext parsing for YouTube acquisition.
export function youtubeVideoId(href = window.location.href) {
  const url = new URL(href);
  return url.pathname.startsWith("/shorts/")
    ? url.pathname.split("/")[2] || null
    : url.pathname === "/watch"
      ? url.searchParams.get("v")
      : null;
}

export function activeYoutubePlayer(
  root = document,
  href = window.location.href
) {
  if (new URL(href).pathname.startsWith("/shorts/"))
    return (
      root.querySelector(
        "ytd-reel-video-renderer[is-active] .html5-video-player, ytd-reel-video-renderer[active] .html5-video-player"
      ) || root.querySelector("#shorts-player.html5-video-player")
    );
  return (
    root.querySelector("#movie_player") ||
    root.querySelector("#container .html5-video-player")
  );
}

export function captionUrl(value, videoId, base = window.location.href) {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" &&
      /(^|\.)youtube\.com$/.test(url.hostname) &&
      url.pathname === "/api/timedtext" &&
      url.searchParams.get("v") === videoId
      ? url
      : null;
  } catch {
    return null;
  }
}

export function captionTrackId(track) {
  return [
    track.vssId || "",
    track.languageCode || "",
    track.kind || "",
    track.name?.simpleText ||
      track.name?.runs?.map((r) => r.text).join("") ||
      track.name ||
      "",
  ].join("|");
}

export function selectCaptionTrack(snapshot) {
  const tracks = (snapshot.captionTracks || []).filter(
    (t) => !/live chat/i.test(t.name?.simpleText || "")
  );
  const selected = snapshot.selectedTrack;
  if (selected?.vssId)
    return tracks.find((t) => t.vssId === selected.vssId) || null;
  if (selected?.languageCode) {
    const matches = tracks.filter(
      (t) =>
        t.languageCode === selected.languageCode &&
        (t.kind || "") === (selected.kind || "") &&
        (!selected.name ||
          JSON.stringify(t.name) === JSON.stringify(selected.name))
    );
    return matches.length === 1 ? matches[0] : null;
  }
  const defaultTrack =
    snapshot.captionTracks?.[snapshot.defaultCaptionTrackIndex];
  return tracks.includes(defaultTrack)
    ? defaultTrack
    : tracks.length === 1
      ? tracks[0]
      : null;
}

export function parseTimedText(text) {
  if (!text?.trim())
    throw Object.assign(new Error("EMPTY_RESPONSE"), {
      code: "EMPTY_RESPONSE",
    });
  try {
    if (text.trim().startsWith("{")) {
      const data = JSON.parse(text);
      if (!Array.isArray(data.events)) throw new Error();
      if (
        data.events.some(
          (event) =>
            !event ||
            typeof event !== "object" ||
            ["tStartMs", "dDurationMs"].some(
              (key) =>
                event[key] !== undefined &&
                (!Number.isFinite(event[key]) || event[key] < 0)
            ) ||
            (event.segs &&
              (!Array.isArray(event.segs) ||
                event.segs.some(
                  (seg) =>
                    !seg ||
                    typeof seg.utf8 !== "string" ||
                    (seg.tOffsetMs !== undefined &&
                      (!Number.isFinite(seg.tOffsetMs) || seg.tOffsetMs < 0))
                )))
        )
      )
        throw new Error();
      if (!data.events.some((e) => e.segs?.some((s) => s.utf8?.trim())))
        throw Object.assign(new Error(), { code: "EMPTY_EVENTS" });
      return data.events;
    }
    const xml = new DOMParser().parseFromString(text, "text/xml");
    if (xml.querySelector("parsererror")) throw new Error();
    const events = Array.from(
      xml.querySelectorAll("transcript > text, timedtext > body > p")
    ).map((node) => {
      const srv3 = node.tagName === "p";
      return {
        tStartMs:
          Number(node.getAttribute(srv3 ? "t" : "start")) * (srv3 ? 1 : 1000),
        dDurationMs:
          Number(node.getAttribute(srv3 ? "d" : "dur")) * (srv3 ? 1 : 1000),
        segs:
          srv3 && node.querySelector("s")
            ? Array.from(node.childNodes).map((child) => ({
                utf8: child.textContent || "",
                ...(child.nodeType === 1 && child.hasAttribute("t")
                  ? { tOffsetMs: Number(child.getAttribute("t")) }
                  : {}),
              }))
            : [{ utf8: node.textContent || "" }],
      };
    });
    if (
      !events.length ||
      events.some(
        (e) =>
          !Number.isFinite(e.tStartMs) ||
          !Number.isFinite(e.dDurationMs) ||
          e.tStartMs < 0 ||
          e.dDurationMs < 0 ||
          e.segs.some(
            (s) => s.tOffsetMs !== undefined && !Number.isFinite(s.tOffsetMs)
          )
      )
    )
      throw new Error();
    if (!events.some((e) => e.segs.some((s) => s.utf8.trim())))
      throw Object.assign(new Error(), { code: "EMPTY_EVENTS" });
    return events;
  } catch (error) {
    throw Object.assign(new Error(error.code || "INVALID_FORMAT"), {
      code: error.code || "INVALID_FORMAT",
    });
  }
}
