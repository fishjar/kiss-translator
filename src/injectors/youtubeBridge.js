/** Page-world bridge; self-contained so the userscript can serialize this installer. */
export function installYoutubeBridge(createAudioBridge) {
  const key = "__kissYoutubeCaptionBridge";
  if (window[key]) {
    window[key].attachAudio?.(createAudioBridge);
    return;
  }
  const origin = window.location.origin,
    protocol = "kiss-youtube-captions-v1";
  const originalFetch = window.fetch,
    open = XMLHttpRequest.prototype.open,
    send = XMLHttpRequest.prototype.send;
  const requests = new Map(),
    captureReads = new Set(),
    ownUrls = new Map(),
    xhrUrls = new WeakMap(),
    cache = new Map();
  let cacheBytes = 0,
    enabled = true,
    disposed = false,
    observer,
    currentId,
    audioBridge;
  const id = () =>
    window.location.pathname.startsWith("/shorts/")
      ? window.location.pathname.split("/")[2]
      : window.location.pathname === "/watch"
        ? new URL(window.location.href).searchParams.get("v")
        : null;
  const validUrl = (value) => {
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "https:" &&
        /(^|\.)youtube\.com$/.test(url.hostname) &&
        url.pathname === "/api/timedtext" &&
        url.searchParams.get("v") === id()
        ? url
        : null;
    } catch {
      return null;
    }
  };
  const post = (data) => {
    if (!disposed) window.postMessage({ protocol, ...data }, origin);
  };
  const clear = () => {
    captureReads.forEach((controller) => controller.abort());
    cache.clear();
    cacheBytes = 0;
  };
  const sync = () => {
    if (currentId !== id()) {
      currentId = id();
      clear();
    }
  };
  const remember = (url, response) => {
    sync();
    if (!enabled || !validUrl(url)) return;
    const bytes =
      response === undefined
        ? 0
        : new TextEncoder().encode(response).byteLength;
    if (bytes > 8 * 1024 * 1024) {
      post({ type: "capture", videoId: id(), url, code: "TOO_LARGE" });
      return;
    }
    const previous = cache.get(url);
    if (response === undefined && previous && Date.now() - previous.at < 60000)
      return;
    if (previous) cacheBytes -= previous.bytes;
    cache.delete(url);
    cache.set(url, { url, response, bytes, at: Date.now() });
    cacheBytes += bytes;
    while (cache.size > 4 || cacheBytes > 8 * 1024 * 1024) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).bytes;
      cache.delete(oldest);
    }
    post({ type: "capture", videoId: id(), url, response });
  };
  const read = async (response, signal) => {
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > 8 * 1024 * 1024)
        throw Object.assign(new Error(), { code: "TOO_LARGE" });
      return text;
    }
    const decoder = new TextDecoder(),
      parts = [];
    let bytes = 0;
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      while (!signal?.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 8 * 1024 * 1024)
          throw Object.assign(new Error(), { code: "TOO_LARGE" });
        parts.push(decoder.decode(chunk.value, { stream: true }));
      }
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return parts.join("") + decoder.decode();
    } finally {
      signal?.removeEventListener("abort", cancel);
      cancel();
      reader.releaseLock();
    }
  };
  const fetchWrapper = function (...args) {
    const url =
      typeof args[0] === "string" ? args[0] : args[0]?.url || args[0]?.href;
    const capture = audioBridge?.prepare(args);
    let promise;
    try { promise = Reflect.apply(originalFetch, this, args); }
    catch (error) { audioBridge?.abortPrepared(capture); throw error; }
    audioBridge?.observe(promise, capture);
    if (enabled && validUrl(url))
      promise
        .then((response) => {
          if (!response.ok || !validUrl(url)) return;
          const controller = new AbortController(),
            timer = setTimeout(() => controller.abort(), 8000);
          captureReads.add(controller);
          void read(response.clone(), controller.signal)
            .then((text) => remember(url, text))
            .catch((error) => {
              if (error.code === "TOO_LARGE")
                post({ type: "capture", videoId: id(), url, code: error.code });
            })
            .finally(() => {
              clearTimeout(timer);
              captureReads.delete(controller);
            });
        })
        .catch(() => {});
    return promise;
  };
  const openWrapper = function (method, url, ...args) {
    xhrUrls.set(this, { url: String(url) });
    return Reflect.apply(open, this, [method, url, ...args]);
  };
  const sendWrapper = function (...args) {
    const entry = xhrUrls.get(this);
    const load = () => {
      if (xhrUrls.get(this) !== entry || !enabled) return;
      try {
        if (
          this.status >= 200 &&
          this.status < 300 &&
          (!this.responseType || this.responseType === "text")
        )
          remember(this.responseURL || entry?.url, this.responseText);
      } catch {
        /* Host getter can throw. */
      }
    };
    const cleanup = () => {
      this.removeEventListener("load", load);
      this.removeEventListener("loadend", cleanup);
    };
    this.addEventListener("load", load);
    this.addEventListener("loadend", cleanup, { once: true });
    try {
      return Reflect.apply(send, this, args);
    } catch (error) {
      cleanup();
      throw error;
    }
  };
  const player = () =>
    window.location.pathname.startsWith("/shorts/")
      ? document.querySelector(
          "ytd-reel-video-renderer[is-active] .html5-video-player, ytd-reel-video-renderer[active] .html5-video-player"
        ) || document.querySelector("#shorts-player.html5-video-player")
      : document.querySelector("#movie_player");
  const extract = (text) => {
    const marker = text.indexOf("ytInitialPlayerResponse"),
      start = marker < 0 ? -1 : text.indexOf("{", marker);
    if (start < 0) return null;
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
    return null;
  };
  const normalize = (track) => {
    if (!track || typeof track !== "object") return null;
    const text = (value, max) =>
      typeof value === "string" ? value.slice(0, max) : "";
    const baseUrl = text(track.baseUrl || track.url, 32768);
    let languageCode = text(track.languageCode, 100);
    if (!languageCode) {
      try {
        languageCode =
          new URL(baseUrl, window.location.href).searchParams.get("lang") || "";
      } catch {}
    }
    const name =
      typeof track.name === "string"
        ? track.name
        : track.name?.simpleText ||
          track.name?.runs?.map((r) => r.text).join("");
    return {
      baseUrl,
      languageCode,
      vssId: text(track.vssId || track.vss_id, 256),
      kind: text(track.kind, 32),
      name: { simpleText: text(name, 512) },
    };
  };
  const call = (p, method, ...args) => {
    try {
      return typeof p?.[method] === "function" ? p[method](...args) : undefined;
    } catch {
      return undefined;
    }
  };
  const snapshot = (data) => {
    const p = player();
    const playerResponse = call(p, "getPlayerResponse");
    const playerVideoId =
      playerResponse?.videoDetails?.videoId ||
      call(p, "getVideoData")?.video_id;
    const currentPlayer = !playerVideoId || playerVideoId === id();
    let response = data || playerResponse;
    if (response?.videoDetails?.videoId !== id())
      response = Array.from(document.scripts)
        .map((s) => extract(s.textContent || ""))
        .find((r) => r?.videoDetails?.videoId === id());
    const renderer = response?.captions?.playerCaptionsTracklistRenderer;
    const audio = renderer?.audioTracks?.[renderer.defaultAudioTrackIndex || 0];
    const index = audio?.defaultCaptionTrackIndex,
      indices = audio?.captionTrackIndices;
    return {
      videoId: response?.videoDetails?.videoId || id(),
      captionTracks: (Array.isArray(renderer?.captionTracks)
        ? renderer.captionTracks
        : []
      )
        .slice(0, 200)
        .map(normalize)
        .filter(Boolean),
      runtimeTracks: (currentPlayer
        ? call(p, "getAudioTrack")?.captionTracks || []
        : []
      )
        .slice(0, 200)
        .map(normalize)
        .filter(Boolean),
      defaultCaptionTrackIndex:
        Array.isArray(indices) && !indices.includes(index)
          ? indices[index]
          : index,
      selectedTrack: currentPlayer
        ? normalize(call(p, "getOption", "captions", "track"))
        : null,
      fullDescription: response?.videoDetails?.shortDescription || "",
      ready: currentPlayer && response?.videoDetails?.videoId === id(),
      paused: p?.querySelector("video")?.paused ?? true,
      isAd: !!p?.matches(".ad-showing, .ad-interrupting"),
      ccEnabled:
        p
          ?.querySelector(".ytp-subtitles-button")
          ?.getAttribute("aria-pressed") === "true",
      captures: Array.from(cache.values())
        .filter((c) => Date.now() - c.at < 60000)
        .map(({ url, response }) => ({ url, response })),
    };
  };
  const onMessage = async (event) => {
    if (
      event.source !== window ||
      event.origin !== origin ||
      event.data?.protocol !== protocol ||
      event.data?.type !== "request"
    )
      return;
    const { requestId, videoId, action, url, targetId } = event.data;
    if (typeof requestId !== "string" || requestId.length > 100) return;
    sync();
    if (action === "cancel") {
      requests.get(targetId)?.abort();
      return;
    }
    if (action === "clear") {
      enabled = false;
      clear();
      requests.forEach((c) => c.abort());
      return;
    }
    if (videoId !== id() || !videoId) {
      post({ type: "response", requestId, code: "STALE_VIDEO" });
      return;
    }
    enabled = true;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 8000);
    requests.set(requestId, controller);
    try {
      let result;
      if (action === "snapshot") {
        result = snapshot();
        if (event.data.lightweight) result.captures = [];
      } else if (action === "metadata") {
        const response = await Reflect.apply(originalFetch, window, [
          new URL(`/watch?v=${encodeURIComponent(videoId)}`, origin).href,
          { credentials: "include", signal: controller.signal },
        ]);
        result = snapshot(extract(await read(response, controller.signal)));
      } else if (action === "fetch") {
        const parsed =
          typeof url === "string" && url.length < 32768 && validUrl(url);
        if (!parsed)
          throw Object.assign(new Error(), { code: "INVALID_REQUEST" });
        ownUrls.set(parsed.href, Date.now() + 13000);
        const response = await Reflect.apply(originalFetch, window, [
          parsed.href,
          { credentials: "include", signal: controller.signal },
        ]);
        result = {
          status: response.status,
          retryAfter: response.headers.get("Retry-After"),
          body: response.ok ? await read(response, controller.signal) : "",
        };
      } else if (action === "refresh") {
        const p = player(),
          cc = p?.querySelector(".ytp-subtitles-button");
        if (cc?.getAttribute("aria-pressed") === "false") cc.click();
        else call(p, "setOption", "captions", "reload", true);
        result = snapshot();
      } else throw Object.assign(new Error(), { code: "INVALID_REQUEST" });
      if (videoId !== id())
        throw Object.assign(new Error(), { code: "STALE_VIDEO" });
      post({ type: "response", requestId, videoId, result });
    } catch (error) {
      post({
        type: "response",
        requestId,
        videoId,
        code: controller.signal.aborted
          ? "TIMEOUT"
          : typeof error.code === "string"
            ? error.code
            : "NETWORK",
      });
    } finally {
      clearTimeout(timer);
      requests.delete(requestId);
    }
  };
  const scan = (entries) => {
    sync();
    for (const [url, until] of ownUrls)
      if (until < Date.now()) ownUrls.delete(url);
    entries.forEach((entry) => {
      if (!ownUrls.has(entry.name)) remember(entry.name);
    });
  };
  try {
    window.fetch = fetchWrapper;
    XMLHttpRequest.prototype.open = openWrapper;
    XMLHttpRequest.prototype.send = sendWrapper;
  } catch {
    /* Resource Timing remains available. */
  }
  try {
    observer = new PerformanceObserver((list) => scan(list.getEntries()));
    observer.observe({ type: "resource", buffered: true });
    scan(performance.getEntriesByType("resource"));
  } catch {
    /* Optional in legacy userscript browsers. */
  }
  const navigate = () => {
    sync();
    audioBridge?.clear();
    requests.forEach((c) => c.abort());
  };
  const pagehide = (event) => {
    if (event.persisted) {
      clear();
      audioBridge?.clear();
      requests.forEach((c) => c.abort());
    } else dispose();
  };
  const dispose = () => {
    disposed = true;
    requests.forEach((c) => c.abort());
    clear();
    audioBridge?.dispose();
    observer?.disconnect();
    window.removeEventListener("message", onMessage);
    window.removeEventListener("yt-navigate-start", navigate);
    window.removeEventListener("pagehide", pagehide);
    if (window.fetch === fetchWrapper) window.fetch = originalFetch;
    if (XMLHttpRequest.prototype.open === openWrapper)
      XMLHttpRequest.prototype.open = open;
    if (XMLHttpRequest.prototype.send === sendWrapper)
      XMLHttpRequest.prototype.send = send;
    delete window[key];
  };
  window.addEventListener("message", onMessage);
  window.addEventListener("yt-navigate-start", navigate);
  window.addEventListener("pagehide", pagehide);
  const attachAudio = (factory) => {
    if (audioBridge || typeof factory !== "function") return;
    try {
      audioBridge = factory({ fetch: (...args) => Reflect.apply(originalFetch, window, args), getPlayer: player, getVideoId: id });
    } catch { /* Captions remain available when audio is unsupported. */ }
  };
  attachAudio(createAudioBridge);
  window[key] = { dispose, attachAudio };
  post({ type: "ready" });
}
