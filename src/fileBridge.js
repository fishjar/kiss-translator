import browser from "webextension-polyfill";
import { FILE_CHANNEL, isFileBridgePage } from "./fileTranslation/protocol";

const bridgeKey = "__kissFileTranslationBridge";
if (
  window === window.top &&
  isFileBridgePage(window.location.href) &&
  !window[bridgeKey]?.isActive()
) {
  window[bridgeKey]?.dispose();
  const extensionId = browser.runtime.id;
  let port;
  let bridgeId;
  let disposed = false;
  const isActive = () => {
    try {
      return !disposed && browser.runtime.id === extensionId;
    } catch {
      return false;
    }
  };
  const closePort = () => {
    const previous = port;
    port = null;
    try {
      previous?.disconnect();
    } catch {
      // The old extension context may already have been invalidated.
    }
  };
  const dispose = () => {
    disposed = true;
    closePort();
    window.removeEventListener("message", receive);
    window.removeEventListener("pagehide", closePort);
    if (window[bridgeKey]?.dispose === dispose) delete window[bridgeKey];
  };
  const post = (message) =>
    window.postMessage(
      {
        channel: FILE_CHANNEL,
        direction: "extension",
        extensionId,
        bridgeId,
        ...message,
      },
      window.location.origin
    );
  const connect = () => {
    if (port) return;
    try {
      const nextPort = browser.runtime.connect({ name: FILE_CHANNEL });
      port = nextPort;
      bridgeId = crypto.randomUUID();
      nextPort.onMessage.addListener((message) => {
        if (port === nextPort) post(message);
      });
      nextPort.onDisconnect.addListener(() => {
        if (port !== nextPort) return;
        port = null;
        post({ type: "disconnected" });
      });
    } catch {
      closePort();
      post({ type: "disconnected" });
      if (!isActive()) dispose();
    }
  };
  const receive = ({ source, origin, data }) => {
    if (
      source !== window ||
      origin !== window.location.origin ||
      data?.channel !== FILE_CHANNEL ||
      data.direction !== "web"
    )
      return;
    if (!isActive()) {
      post({ type: "disconnected" });
      dispose();
      return;
    }
    if (data.type === "discover") {
      connect();
      if (port) post({ type: "available" });
    } else if (
      port &&
      data.extensionId === extensionId &&
      data.bridgeId === bridgeId
    ) {
      if (data.type === "disconnect") {
        closePort();
      } else if (data.type === "request") {
        try {
          port.postMessage(data.request);
        } catch {
          closePort();
          post({ type: "disconnected" });
          if (!isActive()) dispose();
        }
      }
    }
  };
  window.addEventListener("message", receive);
  window.addEventListener("pagehide", closePort);
  window[bridgeKey] = { isActive, dispose };
}
